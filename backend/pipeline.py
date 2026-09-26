"""
Field pipeline: the sophisticated path from sky position to measured candidates.

  discover (cached) -> fetch IBE cutouts -> parse/mask -> WCS-align B onto A ->
  significance difference -> dipole movers + variables -> aperture photometry ->
  Gaia/SkyBoT labels.

Every entry point is bounded and never raises; failures degrade to explicit
`detail` strings the API forwards verbatim.
"""
import asyncio
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

# Shared fetch throttle: IRSA 429/408-sensitive; 4 concurrent max.
_FETCH_SEM: Any = None


def _fetch_sem() -> Any:
    import asyncio
    global _FETCH_SEM
    if _FETCH_SEM is None:
        _FETCH_SEM = asyncio.Semaphore(4)
    return _FETCH_SEM


async def _fetch_many(urls: List[str]) -> List[Any]:
    """Concurrent _fetch_frame over urls (order-preserving, None on failure)."""
    import asyncio
    sem = _fetch_sem()

    async def one(url: str) -> Any:
        async with sem:
            return await _fetch_frame(url)

    return list(await asyncio.gather(*(one(u) for u in urls)))

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
        if isinstance(hit, list) and hit:
            return hit
    except Exception:
        pass
    hits = [h for h in discover_epochs(ra, dec, band=band, size_deg=size_deg) if h.get("cutout_url")]
    if hits:
        try:
            api_cache_set(db_path, key, hits)
        except Exception:
            pass
        return hits
    # outage path: serve last-known discovery rather than nothing
    try:
        stale = api_cache_get(db_path, key, 3600, allow_stale=True)
        if isinstance(stale, list) and stale:
            print(f"discover: serving {len(stale)} stale hits for ({ra},{dec}) band {band}")
            return stale
    except Exception:
        pass
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
            print(f"frame empty IMAGE: {cutout_url[:120]}")
            return None
        masked, badmask = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
        import numpy as np
        return {"image": masked, "mask": np.asarray(badmask, dtype=bool),
                "variance": parsed.get("variance"), "wcs": parsed.get("wcs"),
                "wavelength_um": parsed.get("wavelength_um"),
                "bandwidth_um": parsed.get("bandwidth_um"),
                "pixel_scale_arcsec": parsed.get("pixel_scale_arcsec")}
    except Exception as e:  # noqa: BLE001
        print(f"frame fetch failed ({cutout_url[:120]}): {e or type(e).__name__}")
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
    # some covering frames 422 on IBE despite TAP footprints: walk inward.
    # First pass concurrently (4-way semaphore), then fill gaps serially.
    fa = fb = None
    first = last = None
    cands_a = [h["cutout_url"] for h in hits[:4]]
    got_a = await _fetch_many(cands_a)
    for h, f in zip(hits[:4], got_a):
        if f is not None:
            fa, first = f, h
            break
    if fa is None:
        for h in hits[4:]:
            fa = await _fetch_frame(h["cutout_url"])
            if fa is not None:
                first = h
                break
    cands_b = [h["cutout_url"] for h in hits[-4:][::-1]]
    got_b = await _fetch_many(cands_b)
    for h, f in zip(hits[-4:][::-1], got_b):
        if f is not None and h is not first:
            fb, last = f, h
            break
    if fb is None:
        for h in list(reversed(hits[:-4])) if len(hits) > 4 else []:
            fb = await _fetch_frame(h["cutout_url"])
            if fb is not None:
                last = h
                break
    if fa is None or fb is None:
        return {"candidates": [], "matched": 0, "detail": "fetch-failed",
                "mjd_a": first.get("mjd"), "mjd_b": last.get("mjd")}
    b_on_a, align_info = align_images(fa["image"], fa["wcs"], fb["image"], fb["wcs"])
    meas = measure_field(fa["image"], b_on_a, fa.get("variance"), fb.get("variance"),
                         mask_a=fa.get("mask"), mask_b=None)
    mjd_a, mjd_b = first.get("mjd"), last.get("mjd")
    dt_days = (mjd_b or 0) - (mjd_a or 0)
    # field motion from the top mover's dipole span (was: same position
    # twice, always 0.0). None when no movers — UI says so honestly.
    motion = None
    try:
        from backend.config import PIXEL_SCALE_ARCSEC
        movers = [c for c in meas["candidates"] if c.get("kind") == "mover"]
        if movers and dt_days and dt_days > 0:
            top = max(movers, key=lambda c: c.get("sigma", 0))
            motion = float(top.get("separation_px", 0)) * float(PIXEL_SCALE_ARCSEC) / dt_days
    except Exception:
        motion = None
    # label candidates: Gaia star within 5" of the CANDIDATE's own sky
    # position (was: field-center result stamped on all); SkyBoT per
    # candidate cone (capped; cached hits/misses make repeats cheap).
    gaia = query_gaia(ra, dec, 8.0, db_path=db_path)
    skybot = None
    skybot_status = "unavailable"
    try:
        if mjd_a:
            skybot = await query_skybot(ra, dec, float(mjd_a), 60.0, db_path=db_path)
            skybot_status = "ok" if skybot else "empty"
    except Exception:
        skybot_status = "error"

    def _cand_sky(c):
        try:
            w = fa.get("wcs")
            if w is None:
                return None
            r = w.all_pix2world([[float(c["x"]), float(c["y"])]], 0)[0]
            return float(r[0]), float(r[1])
        except Exception:
            return None

    def _sep(a, b, c, d):
        import math
        try:
            return math.degrees(math.acos(max(-1.0, min(1.0,
                math.sin(math.radians(b)) * math.sin(math.radians(d))
                + math.cos(math.radians(b)) * math.cos(math.radians(d))
                * math.cos(math.radians(a - c)))))) * 3600.0
        except Exception:
            return 1e9

    for i, c in enumerate(meas["candidates"]):
        sky = _cand_sky(c)
        star = None
        if sky and gaia:
            near = [(g, _sep(sky[0], sky[1], g.get("ra", 1e9), g.get("dec", 1e9)))
                    for g in gaia]
            near = [(g, s) for g, s in near if s < 5.0]
            if near:
                star = min(near, key=lambda gs: gs[1])[0]
        c["gaia"] = star
        if star:
            c["label"] = "Known star"
            continue
        if i < 12 and sky and mjd_a:
            try:
                hit = await query_skybot(sky[0], sky[1], float(mjd_a), 10.0, db_path=db_path)
            except Exception:
                hit = None
            if hit:
                c["label"] = "Known solar-system object"
                c["skybot"] = hit
                continue
        c["label"] = ("Unidentified – possible discovery"
                      if i < 12 else "Unchecked – crowded field")
    return {"candidates": meas["candidates"], "matched": 0,
            "movers": sum(1 for c in meas["candidates"] if c["kind"] == "mover"),
            "variables": sum(1 for c in meas["candidates"] if c["kind"] == "variable"),
            "sigma_max": meas["sigma_max"], "sigma_min": meas["sigma_min"],
            "npix_sig5": meas["npix_sig5"], "align": align_info,
            "gaia": gaia, "skybot": skybot, "skybot_status": skybot_status,
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
        stale = api_cache_get(db_path, key, 6 * 3600, allow_stale=True)
    except Exception:
        hit, stale = None, None
    hits = _sample_hits(discover_cached(ra, dec, band, size_deg, db_path), max_epochs)
    if not hits:
        return {"points": [], "detail": "no-epochs"}
    points = []
    got = await _fetch_many([h["cutout_url"] for h in hits])
    for h, f in zip(hits, got):
        if f is None:
            continue
        xy = sky_to_pixel(ra, dec, f["wcs"], f["image"].shape)
        if xy is None:
            continue
        m = aperture_flux(f["image"], xy[0], xy[1], variance=f.get("variance"))
        points.append({"mjd": h.get("mjd"), "flux": m["flux"], "flux_err": m["flux_err"],
                       "x": xy[0], "y": xy[1]})
    out = {"points": points, "band": band, "detail": "ok" if points else "fetch-failed"}
    if points and len(points) < len(hits):
        out["detail"] = "partial"
        out["missing"] = len(hits) - len(points)
    if not points and isinstance(stale, dict) and stale.get("points"):
        out = {**stale, "detail": "stale"}
    elif points:
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
        stale = api_cache_get(db_path, key, 6 * 3600, allow_stale=True)
    except Exception:
        hit, stale = None, None
    points = []
    attempted = 0
    discs = await asyncio.gather(*[
        asyncio.to_thread(discover_cached, ra, dec, b["id"], size_deg, db_path)
        for b in BANDS])
    jobs = [(b, hits[-1]) for b, hits in zip(BANDS, discs) if hits]
    attempted = len(jobs)
    got = await _fetch_many([h["cutout_url"] for _, h in jobs])
    for (b, h), f in zip(jobs, got):
        det = b["id"]
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
    if points and len(points) < attempted:
        out["detail"] = "partial"
        out["missing"] = attempted - len(points)
    if not points and isinstance(stale, dict) and stale.get("points"):
        out = {**stale, "detail": "stale"}
    elif points:
        try:
            api_cache_set(db_path, key, out)
        except Exception:
            pass
    return out


def flag_variable(points: List[Dict[str, Any]], ratio: float = 2.0, snr: float = 3.0) -> bool:
    """True when any two light-curve points differ by >ratio at S/N > snr. Pure."""
    try:
        fluxes = [(p["flux"], p.get("flux_err", 0)) for p in points if p.get("flux") is not None]
        for i in range(len(fluxes)):
            for j in range(i + 1, len(fluxes)):
                fa, ea = fluxes[i]
                fb, eb = fluxes[j]
                if min(abs(fa), abs(fb)) <= 0:
                    continue
                if max(abs(fa), abs(fb)) / min(abs(fa), abs(fb)) > ratio:
                    if abs(fa - fb) > snr * max(ea, eb, 1e-9):
                        return True
    except Exception:
        pass
    return False


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
