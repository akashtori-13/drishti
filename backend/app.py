"""
SpectraHunt FastAPI Backend

Provides REST API endpoints for the front-end.
Supports both live mode (API server) and static bundle generation.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import (
    RELEASE, RELEASE_DOI, PIPELINE_VERSION, CITATION_TEXT,
    GRID_W, GRID_H, DATABASE_PATH, PNG_CACHE_DIR, CORS_ORIGINS
)
from .db import init_db, get_connection, get_coverage_counts, get_candidates, get_candidate_by_id, get_status
from .ingest import run_ingest
from .detect import run_detection


# Pydantic models for API responses

class StatusResponse(BaseModel):
    release: str
    last_ingest_at: Optional[str]
    newest_planning_period: Optional[str]
    frames_indexed: int
    fields_indexed: int
    candidates_this_week: int
    pipeline_version: str


class CoverageResponse(BaseModel):
    grid: Dict[str, int]
    counts: List[List[int]]
    indexed: List[List[int]]
    generated_at: str


class FrameInfo(BaseModel):
    frame_id: str
    band: int
    detector: int
    survey: str
    obs_id: str
    wavelength_um_at_pos: Optional[float]
    bandwidth_um_at_pos: Optional[float]
    access_url: str
    s3_key: Optional[str]


class EpochInfo(BaseModel):
    epoch_id: str
    planning_period: str
    mjd: float
    utc: str
    frames: List[FrameInfo]


class FieldResponse(BaseModel):
    ra: float
    dec: float
    epochs: List[EpochInfo]
    bands_present: List[int]
    survey: str


class BlinkFrame(BaseModel):
    epoch_label: str
    obs_id: str
    utc: str
    mjd: float
    wavelength_um: Optional[float]
    png_url: str
    fits_url: str
    pixel_scale_arcsec: float


class BlinkResponse(BaseModel):
    frames: List[BlinkFrame]
    diff_frames: List[Dict[str, Any]]
    wcs_note: str


class CandidateSummary(BaseModel):
    id: str
    name: str
    ra: float
    dec: float
    band: int
    epoch_a: str
    epoch_b: str
    mjd_a: float
    mjd_b: float
    significance_sigma: float
    motion_arcsec: float
    motion_pa_deg: float
    skybot_match: Optional[Dict[str, Any]]
    status: str
    thumb_urls: List[str]
    created_at: str


class ResolveResult(BaseModel):
    type: str  # "coordinates", "fixed", "solar_system"
    ra: Optional[float]
    dec: Optional[float]
    name: Optional[str]
    ephemerides: Optional[List[Dict[str, Any]]]


# Application lifespan handler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database
    init_db()
    yield
    # Shutdown: cleanup if needed


app = FastAPI(title="SpectraHunt API", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving PNGs
data_dir = Path("data")
if data_dir.exists():
    app.mount("/data", StaticFiles(directory="data"), name="data")


def esc(s: str) -> str:
    """HTML escape for security."""
    return (s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;"))


@app.get("/api/status", response_model=StatusResponse)
async def get_api_status():
    """Get API status including release info and ingestion stats."""
    conn = get_connection()
    cur = conn.cursor()
    
    last_ingest = get_status(cur, "last_ingest_at")
    newest_pp = get_status(cur, "newest_planning_period")
    frames_count = get_status(cur, "frames_indexed") or 0
    
    # Count distinct fields (cells with coverage)
    cur.execute("""
        SELECT COUNT(DISTINCT cell_i * 1000 + cell_j) FROM frame_cell_map
    """)
    fields_count = cur.fetchone()[0] or 0
    
    # Count recent candidates (this week)
    from datetime import timedelta
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cur.execute("SELECT COUNT(*) FROM candidates WHERE created_at >= ?", (week_ago,))
    candidates_week = cur.fetchone()[0] or 0
    
    conn.close()
    
    return StatusResponse(
        release=RELEASE,
        last_ingest_at=last_ingest,
        newest_planning_period=newest_pp,
        frames_indexed=frames_count,
        fields_indexed=fields_count,
        candidates_this_week=candidates_week,
        pipeline_version=PIPELINE_VERSION
    )


@app.get("/api/coverage", response_model=CoverageResponse)
async def get_api_coverage():
    """Get coverage grid for the sky map."""
    conn = get_connection()
    cur = conn.cursor()
    
    counts, indexed = get_coverage_counts(cur)
    conn.close()
    
    return CoverageResponse(
        grid={"w": GRID_W, "h": GRID_H},
        counts=counts,
        indexed=indexed,
        generated_at=datetime.now(timezone.utc).isoformat()
    )


@app.get("/api/field", response_model=FieldResponse)
async def get_api_field(ra: float = Query(...), dec: float = Query(...)):
    """Get field information for a specific RA/Dec position."""
    # Convert to cell coordinates
    cell_i = min(GRID_W - 1, max(0, int(ra / 360 * GRID_W)))
    cell_j = min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H)))
    
    conn = get_connection()
    cur = conn.cursor()
    
    # Get frames for this cell
    cur.execute("""
        SELECT f.* FROM frames f
        JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
        WHERE fcm.cell_i = ? AND fcm.cell_j = ?
        ORDER BY f.planning_period, f.band
    """, (cell_i, cell_j))
    
    frames = cur.fetchall()
    conn.close()
    
    if not frames:
        raise HTTPException(status_code=404, detail="No coverage at this position")
    
    # Group by planning period
    epochs_dict = {}
    bands_present = set()
    survey = "Wide"  # default
    
    for frame in frames:
        pp = frame["planning_period"]
        if pp not in epochs_dict:
            epochs_dict[pp] = {
                "epoch_id": pp,
                "planning_period": pp,
                "mjd": frame["mjd_obs"],
                "utc": datetime.fromtimestamp((frame["mjd_obs"] - 2400000.5) * 86400 + 1721059.5 * 86400, tz=timezone.utc).isoformat(),
                "frames": []
            }
        
        epochs_dict[pp]["frames"].append(FrameInfo(
            frame_id=frame["frame_id"],
            band=frame["band"],
            detector=frame["detector"],
            survey=frame["survey"],
            obs_id=frame["obs_id"],
            wavelength_um_at_pos=None,  # Would need cutout to get actual wavelength
            bandwidth_um_at_pos=None,
            access_url=frame["access_url"],
            s3_key=frame.get("s3_key")
        ))
        
        bands_present.add(frame["band"])
        survey = frame["survey"]
    
    epochs = list(epochs_dict.values())
    
    return FieldResponse(
        ra=ra,
        dec=dec,
        epochs=epochs,
        bands_present=sorted(list(bands_present)),
        survey=survey
    )


@app.get("/api/blink", response_model=BlinkResponse)
async def get_api_blink(
    ra: float = Query(...),
    dec: float = Query(...),
    band: int = Query(3),
    size_arcmin: float = Query(9.0)
):
    """Get blink frames for a position."""
    # This is a simplified implementation
    # Full implementation would fetch real cutouts and render PNGs
    
    # For now, return placeholder structure
    # The real implementation would call cutouts.py functions
    
    raise HTTPException(
        status_code=501,
        detail="Blink endpoint requires cutout processing. Use static bundle for demo."
    )


@app.get("/api/candidates", response_model=List[CandidateSummary])
async def get_api_candidates(
    since: Optional[str] = None,
    band: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=1000)
):
    """Get list of candidates with optional filters."""
    conn = get_connection()
    cur = conn.cursor()
    
    rows = get_candidates(cur, since=since, band=band, status=status, limit=limit)
    conn.close()
    
    results = []
    for row in rows:
        results.append(CandidateSummary(
            id=row["id"],
            name=row["name"],
            ra=row["ra"],
            dec=row["dec"],
            band=row["band"],
            epoch_a=row["epoch_a"],
            epoch_b=row["epoch_b"],
            mjd_a=row["mjd_a"],
            mjd_b=row["mjd_b"],
            significance_sigma=row["significance_sigma"],
            motion_arcsec=row["motion_arcsec"],
            motion_pa_deg=row["motion_pa_deg"],
            skybot_match=json.loads(row["skybot_match"]) if row["skybot_match"] else None,
            status=row["status"],
            thumb_urls=json.loads(row["thumb_urls"]) if row["thumb_urls"] else [],
            created_at=row["created_at"]
        ))
    
    return results


@app.get("/api/candidates/{candidate_id}")
async def get_candidate_detail(candidate_id: str):
    """Get full details for a single candidate."""
    conn = get_connection()
    cur = conn.cursor()
    
    row = get_candidate_by_id(cur, candidate_id)
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    return {
        "id": row["id"],
        "name": row["name"],
        "ra": row["ra"],
        "dec": row["dec"],
        "band": row["band"],
        "epoch_a": row["epoch_a"],
        "epoch_b": row["epoch_b"],
        "mjd_a": row["mjd_a"],
        "mjd_b": row["mjd_b"],
        "significance_sigma": row["significance_sigma"],
        "motion_arcsec": row["motion_arcsec"],
        "motion_pa_deg": row["motion_pa_deg"],
        "motion_arcsec_per_day": row["motion_arcsec_per_day"],
        "skybot_match": json.loads(row["skybot_match"]) if row["skybot_match"] else None,
        "status": row["status"],
        "score_components": json.loads(row["score_components"]) if row["score_components"] else {},
        "thumb_urls": json.loads(row["thumb_urls"]) if row["thumb_urls"] else [],
        "created_at": row["created_at"]
    }


@app.get("/api/resolve", response_model=ResolveResult)
async def api_resolve(q: str = Query(...)):
    """Resolve object name or coordinates."""
    q = q.strip()
    
    # Try parsing as coordinates
    try:
        parts = q.replace(',', ' ').split()
        if len(parts) >= 2:
            ra = float(parts[0])
            dec = float(parts[1])
            if 0 <= ra <= 360 and -90 <= dec <= 90:
                return ResolveResult(
                    type="coordinates",
                    ra=ra,
                    dec=dec,
                    name=None
                )
    except:
        pass
    
    # Would call crossmatch.resolve_object_name here
    # For now, return not found
    
    raise HTTPException(status_code=404, detail=f"No match for '{q}'")


@app.get("/api/skybot")
async def api_skybot(
    ra: float = Query(...),
    dec: float = Query(...),
    mjd: float = Query(...),
    radius_arcsec: float = Query(10.0)
):
    """Query SkyBoT for solar system objects."""
    from .crossmatch import query_skybot
    
    result = await query_skybot(ra, dec, mjd, radius_arcsec, DATABASE_PATH)
    
    if result is None:
        return {"matches": []}
    
    return {"matches": [result]}


# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok", "release": RELEASE}


if __name__ == "__main__":
    import uvicorn
    from .config import API_HOST, API_PORT
    
    uvicorn.run(app, host=API_HOST, port=API_PORT)
