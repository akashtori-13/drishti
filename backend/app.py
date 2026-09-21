"""
SpectraHunt FastAPI backend (live mode / local dev).

Read-only API over the SQLite pipeline DB. All endpoints degrade
gracefully when the DB is empty (return [] / 404 with message, never 500).
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import (
    RELEASE, DOI, PIPELINE_VERSION, GRID_W, GRID_H,
    DATABASE_PATH, CORS_ORIGINS, BANDS,
)
from backend.db import (
    init_db, get_connection, get_coverage_counts,
    get_candidates, get_candidate_by_id, get_status, cell_of,
)


def _db_path() -> str:
    for cand in (DATABASE_PATH, "data/spectrahunt.db", "spectrahunt.db"):
        if Path(cand).exists():
            return cand
    return DATABASE_PATH


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db(_db_path())
    except Exception as e:
        print(f"DB init skipped: {e}")
    yield


app = FastAPI(title="SpectraHunt API", version=PIPELINE_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if Path("data").exists():
    try:
        app.mount("/data", StaticFiles(directory="data"), name="data")
    except Exception:
        pass


class StatusResponse(BaseModel):
    release: str
    last_ingest_at: Optional[str] = None
    newest_planning_period: Optional[str] = None
    frames_indexed: int = 0
    fields_indexed: int = 0
    candidates_this_week: int = 0
    pipeline_version: str = PIPELINE_VERSION


def _api_status_from_db(db: str) -> StatusResponse:
    conn = get_connection(db)
    try:
        last_ingest = get_status(conn, "last_ingest_at")
        newest_pp = get_status(conn, "newest_planning_period")
        try:
            frames_count = conn.execute("SELECT COUNT(*) FROM frames").fetchone()[0] or 0
        except Exception:
            frames_count = 0
        try:
            fields_count = conn.execute(
                "SELECT COUNT(*) FROM (SELECT DISTINCT i, j FROM frame_cell_map)"
            ).fetchone()[0] or 0
        except Exception:
            fields_count = 0
        try:
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            candidates_week = conn.execute(
                "SELECT COUNT(*) FROM candidates WHERE created_at >= ?", (week_ago,)
            ).fetchone()[0] or 0
        except Exception:
            candidates_week = 0
    finally:
        conn.close()
    return StatusResponse(
        release=RELEASE,
        last_ingest_at=last_ingest,
        newest_planning_period=newest_pp,
        frames_indexed=int(frames_count),
        fields_indexed=int(fields_count),
        candidates_this_week=int(candidates_week),
        pipeline_version=PIPELINE_VERSION,
    )


def _norm_candidate(c: Dict[str, Any]) -> Dict[str, Any]:
    status_map = {"unreviewed": "pending", "real": "verified", "artifact": "artifact"}
    out = dict(c)
    out["id"] = str(out.get("id"))
    s = str(out.get("status", "pending"))
    out["status"] = status_map.get(s, s)
    if out.get("thumb_urls") is None:
        out["thumb_urls"] = []
    return out


@app.get("/api/status", response_model=StatusResponse)
async def api_status():
    return _api_status_from_db(_db_path())


@app.get("/api/coverage")
async def api_coverage():
    grid = get_coverage_counts(_db_path())
    conn = get_connection(_db_path())
    try:
        rows = conn.execute("SELECT i, j FROM frame_cell_map GROUP BY i, j").fetchall()
        indexed_set = {(r["i"], r["j"]) for r in rows}
    except Exception:
        indexed_set = set()
    finally:
        conn.close()
    indexed = [[(x, y) in indexed_set for x in range(GRID_W)] for y in range(GRID_H)]
    return {"grid": {"w": GRID_W, "h": GRID_H}, "counts": grid,
            "indexed": indexed, "generated_at": datetime.now(timezone.utc).isoformat()}


@app.get("/api/field")
async def api_field(ra: float = Query(...), dec: float = Query(...)):
    i, j = cell_of(ra, dec)
    conn = get_connection(_db_path())
    try:
        frames = conn.execute("""
            SELECT f.* FROM frames f
            JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
            WHERE fcm.i = ? AND fcm.j = ?
            ORDER BY f.mjd_obs
        """, (i, j)).fetchall()
    finally:
        conn.close()
    if not frames:
        raise HTTPException(status_code=404, detail="No coverage at this position")
    epochs: Dict[str, Dict[str, Any]] = {}
    bands: set = set()
    survey = "Wide"
    band_centers = {1: 0.92, 2: 1.36, 3: 2.02, 4: 3.12, 5: 4.12, 6: 4.71}
    for f in frames:
        d = dict(f)
        bands.add(d.get("band"))
        if "deep" in str(d.get("survey", "")).lower():
            survey = "Deep"
        pp = d.get("planning_period") or "unknown"
        if pp not in epochs:
            epochs[pp] = {"epoch_id": pp, "planning_period": pp,
                          "mjd": d.get("mjd_obs"), "utc": d.get("ingested_at"),
                          "frames": []}
        epochs[pp]["frames"].append({
            "frame_id": d.get("frame_id"), "band": d.get("band"),
            "detector": d.get("detector"), "survey": str(d.get("survey", "Wide")).lower(),
            "obs_id": d.get("obs_id"),
            "wavelength_um_at_pos": band_centers.get(d.get("band"), 2.0),
            "bandwidth_um_at_pos": 0.4,
            "access_url": d.get("access_url"), "s3_key": d.get("s3_key"),
        })
    return {"ra": ra, "dec": dec, "epochs": list(epochs.values()),
            "bands_present": sorted(b for b in bands if b),
            "survey": survey}


@app.get("/api/blink")
async def api_blink(ra: float = Query(...), dec: float = Query(...),
                    band: int = Query(3), size_arcmin: float = Query(10)):
    i, j = cell_of(ra, dec)
    conn = get_connection(_db_path())
    try:
        frames = conn.execute("""
            SELECT f.* FROM frames f
            JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
            WHERE fcm.i = ? AND fcm.j = ? AND f.band = ?
            ORDER BY f.mjd_obs
        """, (i, j, band)).fetchall()
    finally:
        conn.close()
    if len(frames) < 2:
        raise HTTPException(status_code=404,
                            detail="No blink data available - insufficient epochs or wavelength mismatch")
    out = []
    for f in frames:
        d = dict(f)
        out.append({"epoch_label": d.get("planning_period"), "obs_id": d.get("obs_id"),
                    "utc": d.get("ingested_at"), "mjd": d.get("mjd_obs"),
                    "wavelength_um": 2.0, "png_url": "", "fits_url": d.get("access_url"),
                    "pixel_scale_arcsec": 6.2})
    return {"frames": out, "diff_frames": [],
            "wcs_note": "Cutout PNG rendering runs in the offline pipeline; live blink requires cached PNGs."}


@app.get("/api/candidates")
async def api_candidates(since: Optional[str] = None, band: Optional[int] = None,
                         status: Optional[str] = None, limit: int = Query(100, le=500)):
    rev_map = {"pending": "unreviewed", "verified": "real"}
    db_status = rev_map.get(str(status), status) if status else None
    rows = get_candidates(_db_path(), since=since, band=band, status=db_status, limit=limit)
    # get_candidates returns dicts already
    return [_norm_candidate(c) if isinstance(c, dict) else c for c in rows]


@app.get("/api/candidates/{candidate_id}")
async def api_candidate(candidate_id: str):
    row = get_candidate_by_id(_db_path(), candidate_id)
    if not row:
        # try int id
        try:
            row = get_candidate_by_id(_db_path(), int(candidate_id))
        except (ValueError, TypeError):
            row = None
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _norm_candidate(row)


@app.get("/api/resolve")
async def api_resolve(q: str = Query(...)):
    import re
    m = re.match(r"^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$", q)
    if m:
        ra, dec = float(m.group(1)), float(m.group(2))
        if 0 <= ra < 360 and -90 <= dec <= 90:
            return {"name": q.strip(), "ra": ra, "dec": dec, "type": "coordinate"}
    from backend.crossmatch import resolve_object_name
    hit = await resolve_object_name(q.strip())
    if hit:
        return {"name": q.strip(), "ra": hit["ra"], "dec": hit["dec"], "type": "fixed"}
    return {"name": q.strip(), "ra": None, "dec": None, "type": "unknown"}


@app.get("/api/skybot")
async def api_skybot(ra: float = Query(...), dec: float = Query(...),
                     mjd: float = Query(...), radius_arcsec: float = Query(10.0)):
    from backend.crossmatch import query_skybot
    match = await query_skybot(ra, dec, mjd, radius_arcsec, db_path=_db_path())
    return {"matches": [match] if match else []}


@app.get("/api/citation")
async def api_citation():
    from backend.config import CITATION_TEXT
    return {"citation": CITATION_TEXT, "doi": DOI, "release": RELEASE}


@app.get("/health")
async def health():
    return {"ok": True, "release": RELEASE, "version": PIPELINE_VERSION}
