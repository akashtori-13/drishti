"""
SpectraHunt dev API (local use only; production is fully static).

Read-only proxy over IRSA: epoch discovery, cutout rendering, name resolution,
SkyBoT cross-match. Every endpoint degrades gracefully (404/[] — never 500).
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.cache import init_db
from backend.config import (
    CITATION_TEXT,
    CORS_ORIGINS,
    CUTOUT_SIZE_DEG,
    DATABASE_PATH,
    DOI,
    PIPELINE_VERSION,
    PNG_CACHE_DIR,
    RELEASE,
)

ROOT = Path(__file__).parent.parent
SHOWCASE_DIR = ROOT / "spectrahunt-web" / "public" / "showcases"

SHOWCASE_IDS = ["3i-atlas", "ecliptic-mover", "nep-deep", "orion-field",
                "galactic-center", "m31-field", "lmc-field", "virgo-field", "eros-field"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db(DATABASE_PATH)
    except Exception as e:
        print(f"Cache init skipped: {e}")
    yield


app = FastAPI(title="SpectraHunt API", version=PIPELINE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


class EpochHit(BaseModel):
    cutout_url: str
    mjd: Optional[float] = None
    bandpass: Optional[str] = None
    access_url: Optional[str] = None


def _load_showcase(sid: str) -> Dict[str, Any]:
    path = SHOWCASE_DIR / f"{sid}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown showcase '{sid}'")
    return json.loads(path.read_text())


@app.get("/health")
async def health():
    return {"ok": True, "release": RELEASE, "version": PIPELINE_VERSION}


@app.get("/api/showcases")
async def list_showcases() -> List[Dict[str, Any]]:
    out = []
    for sid in SHOWCASE_IDS:
        try:
            doc = _load_showcase(sid)
            out.append({"id": doc["id"], "title": doc["title"],
                        "ra": doc["ra"], "dec": doc["dec"]})
        except HTTPException:
            continue
    return out


@app.get("/api/showcase/{sid}")
async def get_showcase(sid: str) -> Dict[str, Any]:
    return _load_showcase(sid)


@app.get("/api/epochs", response_model=List[EpochHit])
async def api_epochs(ra: float = Query(...), dec: float = Query(...),
                     band: int = Query(3, ge=1, le=6),
                     size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=1.0)):
    from backend.epochs import discover_epochs
    return discover_epochs(ra, dec, band=band, size_deg=size_deg)


@app.get("/api/cutout.png")
async def api_cutout(ra: float = Query(...), dec: float = Query(...),
                     band: int = Query(3, ge=1, le=6),
                     size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=1.0)):
    """Discover newest covering image, fetch IBE cutout, render PNG (cached)."""
    from backend.cutouts import mask_bad_pixels, parse_fits, render_png
    from backend.epochs import discover_epochs
    import hashlib

    hits = [h for h in discover_epochs(ra, dec, band=band, size_deg=size_deg) if h.get("cutout_url")]
    if not hits:
        raise HTTPException(status_code=404, detail="No covering SPHEREx images (or IRSA unreachable)")
    url = hits[-1]["cutout_url"]
    key = hashlib.md5(f"{url}".encode()).hexdigest()[:16]
    png = Path(PNG_CACHE_DIR) / f"{key}.png"
    if png.exists():
        return FileResponse(str(png), media_type="image/png")
    from backend.cutouts import fetch_ibe
    tmp = Path(PNG_CACHE_DIR) / f"_{key}.fits"
    await fetch_ibe(url, tmp)
    try:
        parsed = parse_fits(tmp)
        if parsed["image"] is None:
            raise HTTPException(status_code=502, detail="Empty IMAGE extension")
        masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
        out = render_png(masked, png)
        if not out:
            raise HTTPException(status_code=502, detail="Render failed")
        return FileResponse(str(out), media_type="image/png")
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


@app.get("/api/resolve")
async def api_resolve(q: str = Query(...)):
    import re
    m = re.match(r"^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$", q)
    if m:
        ra, dec = float(m.group(1)), float(m.group(2))
        if 0 <= ra < 360 and -90 <= dec <= 90:
            return {"name": q.strip(), "ra": ra, "dec": dec, "type": "coordinate"}
    from backend.crossmatch import resolve_name
    hit = await resolve_name(q.strip())
    if hit:
        return {"name": q.strip(), "ra": hit["ra"], "dec": hit["dec"], "type": "fixed"}
    return {"name": q.strip(), "ra": None, "dec": None, "type": "unknown"}


@app.get("/api/skybot")
async def api_skybot(ra: float = Query(...), dec: float = Query(...),
                     mjd: float = Query(...), radius_arcsec: float = Query(10.0)):
    from backend.crossmatch import query_skybot
    match = await query_skybot(ra, dec, mjd, radius_arcsec, db_path=DATABASE_PATH)
    return {"matches": [match] if match else []}


@app.get("/api/citation")
async def api_citation():
    return {"citation": CITATION_TEXT, "doi": DOI, "release": RELEASE,
            "generated_at": datetime.now(timezone.utc).isoformat()}


@app.get("/api/detect")
async def api_detect(ra: float = Query(...), dec: float = Query(...),
                     band: int = Query(3, ge=1, le=6),
                     size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=0.5)):
    """Cross-epoch mover/variable detection for one sky position (bounded, never 500)."""
    from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits
    from backend.detect import arcsec_per_day, detect_sources, match_epochs
    from backend.epochs import discover_epochs
    import tempfile

    try:
        hits = [h for h in discover_epochs(ra, dec, band=band, size_deg=size_deg) if h.get("cutout_url")]
        if len(hits) < 2:
            return {"candidates": [], "matched": 0, "detail": "need-2-epochs"}
        first, last = hits[0], hits[-1]
        srcs = []
        for h in (first, last):
            with tempfile.NamedTemporaryFile(suffix=".fits", delete=True) as tmp:
                await fetch_ibe(h["cutout_url"], Path(tmp.name))
                parsed = parse_fits(Path(tmp.name))
                if parsed["image"] is None:
                    return {"candidates": [], "matched": 0, "detail": "empty-image"}
                masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
                srcs.append(detect_sources(masked))
        m = match_epochs(srcs[0], srcs[1])
        cands = [{"kind": c["kind"], "x": c["x"], "y": c["y"]} for c in (m["movers"] + m["variables"])[:50]]
        motion = arcsec_per_day(ra, dec, ra, dec, (last.get("mjd") or 0) - (first.get("mjd") or 0))
        return {"candidates": cands, "matched": m["matched"],
                "movers": len(m["movers"]), "variables": len(m["variables"]),
                "motion_arcsec_day": motion,
                "mjd_a": first.get("mjd"), "mjd_b": last.get("mjd"),
                "detail": "ok"}
    except Exception as e:
        print(f"detect failed: {e}")
        return {"candidates": [], "matched": 0, "detail": "error"}
