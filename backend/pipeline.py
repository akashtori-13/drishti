"""
Field pipeline: the sophisticated path from sky position to measured candidates.

  discover (cached) -> fetch IBE cutouts -> parse/mask -> WCS-align B onto A ->
  significance difference -> dipole movers + variables -> aperture photometry ->
  Gaia/SkyBoT labels.

Every entry point is bounded and never raises; failures degrade to explicit
`detail` strings the API forwards verbatim.
"""
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config import CUTOUT_SIZE_DEG, DATABASE_PATH


def _cache_key(*parts: Any) -> str:
    import hashlib
    return "pipe:" + hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()[:20]


def discover_cached(ra: float, dec: float, band: int, size_deg: float,
                    db_path: str = DATABASE_PATH) -> List[Dict[str, Any]]:
    """TAP discovery with 1h SQLite cache (cutout URLs are deterministic)."""
    from backend.cache import api_cache_get, api_cache_set
    from backend.epochs import discover_epochs
    key = _cache_key("discover", round(ra, 4), round(dec, 4), band, size_deg)
    try:
        hit = api_cache_get(db_path, key, 3600)
        if isinstance(hit, list):
            return hit
    except Exception:
        pass
    hits = [h for h in discover_epochs(ra, dec, band=band, size_deg=size_deg) if h.get("cutout_url")]
    try:
        api_cache_set(db_path, key, hits)
    except Exception:
        pass
    return hits


async def _fetch_frame(cutout_url: str):
    """Fetch + parse + mask one cutout. Returns dict or None."""
    from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits
    tmp = Path(tempfile.mkdtemp()) / "cutout.fits"
    try:
        await fetch_ibe(cutout_url, tmp)
        parsed = parse_fits(tmp)
        if parsed["image"] is None:
            return None
        masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
        return {"image": masked, "variance": parsed.get("variance"), "wcs": parsed.get("wcs"),
                "wavelength_um": parsed.get("wavelength_um"),
                "bandwidth_um": parsed.get("bandwidth_um"),
                "pixel_scale_arcsec": parsed.get("pixel_scale_arcsec")}
    except Exception as e:  # noqa: BLE001
        print(f"frame fetch failed: {e}")
        return None
    finally:
        try:
            tmp.unlink(missing_ok=True)
            tmp.parent.rmdir()
        except Exception:
            pass


async def detect_field(ra: float, dec: float, band: int = 3,
                       size_deg: float = CUTOUT_SIZE_DEG,
                       db_path: str = DATABASE_PATH) -> Dict[str, Any]:
    """Two-epoch (oldest+newest) aligned difference detection. Await inside running loops."""
    return await _detect_async(ra, dec, band, size_deg, db_path)


async def _detect_async(ra, dec, band, size_deg, db_path) -> Dict[str, Any]:
    from backend.align import align_images
    from backend.crossmatch import query_gaia, query_skybot
    from backend.detect import arcsec_per_day
    from backend.photometry import measure_field
    hits = discover_cached(ra, dec, band, size_deg, db_path)
    if len(hits) < 2:
        return {"candidates": [], "matched": 0, "detail": "need-2-epochs",
                "mjd_a": None, "mjd_b": None}
    first, last = hits[0], hits[-1]
    fa = await _fetch_frame(first["cutout_url"])
    fb = await _fetch_frame(last["cutout_url"])
    if fa is None or fb is None:
        return {"candidates": [], "matched": 0, "detail": "fetch-failed",
                "mjd_a": first.get("mjd"), "mjd_b": last.get("mjd")}
    b_on_a, align_info = align_images(fa["image"], fa["wcs"], fb["image"], fb["wcs"])
    meas = measure_field(fa["image"], b_on_a, fa.get("variance"), fb.get("variance"))
    mjd_a, mjd_b = first.get("mjd"), last.get("mjd")
    motion = None
    try:
        motion = arcsec_per_day(ra, dec, ra, dec, (mjd_b or 0) - (mjd_a or 0))
    except Exception:
        pass
    # label candidates: Gaia star within 8" -> known star; else SkyBoT check at field center
    gaia = query_gaia(ra, dec, 8.0, db_path=db_path)
    skybot = None
    try:
        if mjd_a:
            skybot = await query_skybot(ra, dec, float(mjd_a), 60.0, db_path=db_path)
    except Exception:
        pass
    for c in meas["candidates"]:
        c["gaia"] = gaia[0] if gaia else None
        c["label"] = ("Known star" if gaia and (gaia[0].get("separation_arcsec", 99) or 99) < 5
                      else ("Known solar-system object" if skybot else "Unidentified – possible discovery"))
    return {"candidates": meas["candidates"], "matched": 0,
            "movers": sum(1 for c in meas["candidates"] if c["kind"] == "mover"),
            "variables": sum(1 for c in meas["candidates"] if c["kind"] == "variable"),
            "sigma_max": meas["sigma_max"], "sigma_min": meas["sigma_min"],
            "npix_sig5": meas["npix_sig5"], "align": align_info,
            "gaia": gaia, "skybot": skybot,
            "motion_arcsec_day": motion, "mjd_a": mjd_a, "mjd_b": mjd_b,
            "detail": "ok"}


def _sample_hits(hits: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
    hs = sorted([h for h in hits if h.get("mjd")], key=lambda h: h["mjd"])
    if len(hs) <= k:
        return hs
    return [hs[round(i * (len(hs) - 1) / (k - 1))] for i in range(k)]


async def lightcurve_for(ra: float, dec: float, band: int = 3,
                         size_deg: float = CUTOUT_SIZE_DEG, max_epochs: int = 5,
                         db_path: str = DATABASE_PATH) -> Dict[str, Any]:
    """Aperture photometry at one sky position across ≤5 epochs."""
    from backend.align import sky_to_pixel
    from backend.cache import api_cache_get, api_cache_set
    from backend.photometry import aperture_flux
    key = _cache_key("lightcurve", round(ra, 4), round(dec, 4), band, size_deg, max_epochs)
    try:
        hit = api_cache_get(db_path, key, 6 * 3600)
        if isinstance(hit, dict):
            return hit
    except Exception:
        pass
    hits = _sample_hits(discover_cached(ra, dec, band, size_deg, db_path), max_epochs)
    if not hits:
        return {"points": [], "detail": "no-epochs"}
    points = []
    for h in hits:
        f = await _fetch_frame(h["cutout_url"])
        if f is None:
            continue
        xy = sky_to_pixel(ra, dec, f["wcs"], f["image"].shape)
        if xy is None:
            continue
        m = aperture_flux(f["image"], xy[0], xy[1], variance=f.get("variance"))
        points.append({"mjd": h.get("mjd"), "flux": m["flux"], "flux_err": m["flux_err"],
                       "x": xy[0], "y": xy[1]})
    out = {"points": points, "band": band, "detail": "ok" if points else "fetch-failed"}
    try:
        api_cache_set(db_path, key, out)
    except Exception:
        pass
    return out


async def spectrum_for(ra: float, dec: float,
                       size_deg: float = CUTOUT_SIZE_DEG,
                       db_path: str = DATABASE_PATH) -> Dict[str, Any]:
    """Newest-epoch aperture flux in all 6 detector bands: a real mini-spectrum."""
    from backend.align import sky_to_pixel
    from backend.cache import api_cache_get, api_cache_set
    from backend.config import BANDS
    from backend.photometry import aperture_flux
    key = _cache_key("spectrum", round(ra, 4), round(dec, 4), size_deg)
    try:
        hit = api_cache_get(db_path, key, 6 * 3600)
        if isinstance(hit, dict):
            return hit
    except Exception:
        pass
    points = []
    for b in BANDS:
        det = b["id"]
        hits = discover_cached(ra, dec, det, size_deg, db_path)
        if not hits:
            continue
        f = await _fetch_frame(hits[-1]["cutout_url"])
        if f is None:
            continue
        xy = sky_to_pixel(ra, dec, f["wcs"], f["image"].shape)
        if xy is None:
            continue
        m = aperture_flux(f["image"], xy[0], xy[1], variance=f.get("variance"))
        points.append({"band": det, "wavelength_um": f.get("wavelength_um") or b["wave_um"],
                       "flux": m["flux"], "flux_err": m["flux_err"], "mjd": hits[-1].get("mjd")})
    out = {"points": sorted(points, key=lambda p: p["wavelength_um"]),
           "detail": "ok" if points else "fetch-failed"}
    try:
        api_cache_set(db_path, key, out)
    except Exception:
        pass
    return out


def field_report(ra: float, dec: float, band: int = 3) -> Dict[str, Any]:
    """Batch entry point for scripts/process_field.py (runs its own event loop)."""
    import asyncio
    from backend.crossmatch import query_gaia
    det = asyncio.run(_detect_async(ra, dec, band, CUTOUT_SIZE_DEG, DATABASE_PATH))
    lc = asyncio.run(lightcurve_for(ra, dec, band))
    sp = asyncio.run(spectrum_for(ra, dec))
    det["lightcurve"] = lc.get("points", [])
    det["spectrum"] = sp.get("points", [])
    try:
        det["field_gaia"] = query_gaia(ra, dec, 30.0)
    except Exception:
        det["field_gaia"] = []
    det["ra"], det["dec"], det["band"] = ra, dec, band
    return det
