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
                "galactic-center", "m31-field", "lmc-field", "virgo-field", "eros-field",
                "crab-field", "omega-cen-field", "carina-field", "m51-field",
                "m101-field", "smc-field"]


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
    """Aligned difference detection: WCS reproject, significance dipoles, Gaia labels."""
    from backend.pipeline import detect_field
    try:
        return await detect_field(ra, dec, band=band, size_deg=size_deg, db_path=DATABASE_PATH)
    except Exception as e:
        print(f"detect failed: {e}")
        return {"candidates": [], "matched": 0, "detail": "error"}


@app.get("/api/lightcurve")
async def api_lightcurve(ra: float = Query(...), dec: float = Query(...),
                         band: int = Query(3, ge=1, le=6),
                         size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=0.5)):
    """Aperture photometry at one position across ≤5 epochs (cached 6h)."""
    import asyncio
    from backend.pipeline import lightcurve_for
    try:
        return await asyncio.wait_for(
            lightcurve_for(ra, dec, band=band, size_deg=size_deg, db_path=DATABASE_PATH),
            timeout=280)
    except Exception as e:
        print(f"lightcurve failed: {e}")
        return {"points": [], "detail": "error"}


@app.get("/api/spectrum")
async def api_spectrum(ra: float = Query(...), dec: float = Query(...),
                       size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=0.5)):
    """Newest-epoch aperture flux in all 6 bands: a real mini-spectrum (cached 6h)."""
    import asyncio
    from backend.pipeline import spectrum_for
    try:
        return await asyncio.wait_for(
            spectrum_for(ra, dec, size_deg=size_deg, db_path=DATABASE_PATH),
            timeout=280)
    except Exception as e:
        print(f"spectrum failed: {e}")
        return {"points": [], "detail": "error"}


@app.get("/api/stars")
async def api_stars(ra: float = Query(...), dec: float = Query(...),
                    fov_deg: float = Query(10.0, gt=0, le=120.0)):
    """Gaia DR3 stars in the current view (cached 30d). Powers the observer overlay."""
    from backend.crossmatch import query_gaia_cone
    mag_limit = 16.0 if fov_deg < 5 else 13.0 if fov_deg < 20 else 10.5
    try:
        stars = query_gaia_cone(ra, dec, fov_deg * 0.75, mag_limit=mag_limit,
                                top=2000, db_path=DATABASE_PATH)
        return {"stars": stars, "detail": "ok"}
    except Exception as e:
        print(f"stars failed: {e}")
        return {"stars": [], "detail": "error"}


def _prune_frames(keep: int = 500) -> None:
    """Bound the on-demand frame cache: drop oldest beyond `keep` files."""
    try:
        files = sorted(Path(PNG_CACHE_DIR).glob("frame_*.png"), key=lambda p: p.stat().st_mtime)
        for old in files[:-keep] if len(files) > keep else []:
            try:
                old.unlink()
            except Exception:
                pass
    except Exception:
        pass


async def _render_frame_png(cutout_url: str):    """Fetch IBE cutout, render PNG to the file cache. Returns Path or None."""
    import hashlib
    from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits, render_png
    key = hashlib.md5(cutout_url.encode()).hexdigest()[:16]
    png = Path(PNG_CACHE_DIR) / f"frame_{key}.png"
    if png.exists():
        return png
    tmp = Path(PNG_CACHE_DIR) / f"_frame_{key}.fits"
    try:
        await fetch_ibe(cutout_url, tmp)
    except Exception as e:
        print(f"frame fetch failed: {e}")
        return None
    try:
        parsed = parse_fits(tmp)
        if parsed["image"] is None:
            return None
        masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
        out = render_png(masked, png)
        _prune_frames()
        return out
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


@app.get("/api/frames")
async def api_frames(ra: float = Query(...), dec: float = Query(...),
                     band: int = Query(3, ge=1, le=6),
                     size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=0.5)):
    """Epoch list for ANY sky position: makes every visited field blinkable (live mode)."""
    from backend.pipeline import _sample_hits, discover_cached
    try:
        hits = discover_cached(ra, dec, band, size_deg, DATABASE_PATH)
        if len(hits) < 2:
            return {"epochs": [], "detail": "need-2-epochs"}
        picks = _sample_hits(hits, 8)
        base = f"/api/frame.png?ra={ra}&dec={dec}&band={band}&size_deg={size_deg}"
        idx_of = {id(h): i for i, h in enumerate(hits)}
        return {"epochs": [
            {"epoch": idx_of[id(h)], "mjd": h.get("mjd"), "bandpass": h.get("bandpass"),
             "png": f"{base}&epoch={idx_of[id(h)]}"} for h in picks],
            "detail": "ok", "count": len(hits)}
    except Exception as e:
        print(f"frames failed: {e}")
        return {"epochs": [], "detail": "error"}


@app.get("/api/frame.png")
async def api_frame(ra: float = Query(...), dec: float = Query(...),
                    band: int = Query(3, ge=1, le=6),
                    size_deg: float = Query(CUTOUT_SIZE_DEG, gt=0, le=0.5),
                    epoch: int = Query(0, ge=0)):
    """Render one covering epoch as PNG (file-cached). Backs /api/frames."""
    from backend.pipeline import discover_cached
    try:
        hits = discover_cached(ra, dec, band, size_deg, DATABASE_PATH)
        if epoch >= len(hits) or not hits[epoch].get("cutout_url"):
            raise HTTPException(status_code=404, detail="No such epoch")
        out = await _render_frame_png(hits[epoch]["cutout_url"])
        if not out:
            raise HTTPException(status_code=502, detail="Render failed")
        return FileResponse(str(out), media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        print(f"frame failed: {e}")
        raise HTTPException(status_code=500, detail="Frame error")
