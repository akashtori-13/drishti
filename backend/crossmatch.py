"""
Cross-match: SkyBoT (IMCCE), CDS Sesame, JPL Horizons.

Network calls are lazy and cached in the local SQLite scratch DB.
"""

import re
from typing import Any, Dict, List, Optional

from backend.config import API_TIMEOUT_SECONDS, DATABASE_PATH, SKYBOT_URL, USER_AGENT


async def query_skybot(ra: float, dec: float, mjd: float, radius_arcsec: float,
                       db_path: str = DATABASE_PATH) -> Optional[Dict[str, Any]]:
    """Cone-search SkyBoT. Best match dict or None. Caches both hits and misses."""
    from backend.cache import cache_skybot, get_cached_skybot, get_status, set_status
    # circuit breaker: the legacy endpoint 404s since the IMCCE SSP migration.
    # After 3 consecutive failures, skip network for 24h instead of slow-failing.
    import time as _time
    try:
        dead_until = float(get_status(db_path, "skybot:dead_until") or 0)
        if _time.time() < dead_until:
            return None
    except Exception:
        pass
    try:
        cached = get_cached_skybot(db_path, ra, dec, mjd, radius_arcsec)
        if cached is not None:
            return cached[0] if isinstance(cached, list) else cached
    except Exception:
        pass
    try:
        from astropy.time import Time
        date_str = Time(float(mjd), format="mjd").iso[:10].replace("-", "/")
    except Exception:
        date_str = "2025/01/01"
    import httpx
    params = {
        "-sys": "all",
        "-pos": f"{ra},{dec}",
        "-dist": f"{radius_arcsec / 3600:.4f}",
        "-date": date_str,
        "-format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT_SECONDS) as client:
            r = await client.get(f"{SKYBOT_URL}skybot_cone_search.php",
                                 params=params, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            results = r.json()
        try:
            set_status(db_path, "skybot:fail_streak", "0")
        except Exception:
            pass
    except Exception as e:
        print(f"SkyBoT query failed: {e}")
        try:
            streak = int(get_status(db_path, "skybot:fail_streak") or 0) + 1
            set_status(db_path, "skybot:fail_streak", str(streak))
            if streak >= 3:
                set_status(db_path, "skybot:dead_until", str(_time.time() + 86400))
        except Exception:
            pass
        return None
    if not results:
        try:
            cache_skybot(db_path, ra, dec, mjd, radius_arcsec, [])
        except Exception:
            pass
        return None
    try:
        best = results[0] if isinstance(results, list) else results
        match = {
            "name": best.get("Name", best.get("name", "Unknown")),
            "type": best.get("Type", best.get("type", "asteroid")),
            "separation_arcsec": float(best.get("Dist", 0)) * 3600,
            "epoch": date_str,
        }
    except Exception as e:
        print(f"SkyBoT parsing failed: {e}")
        return None
    try:
        cache_skybot(db_path, ra, dec, mjd, radius_arcsec, [match])
    except Exception:
        pass
    return match


async def resolve_name(name: str) -> Optional[Dict[str, Any]]:
    """Resolve a fixed-target name. SIMBAD ASCII first, CDS Sesame fallback."""
    import httpx
    # 1) SIMBAD script output (stable ASCII format)
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT_SECONDS, follow_redirects=True) as client:
            r = await client.get("https://simbad.cds.unistra.fr/simbad/sim-id",
                                 params={"output.format": "ASCII", "Ident": name},
                                 headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                m = re.search(r"Coordinates\(ICRS[^:]*:\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([+-])(\d+)\s+(\d+)\s+([\d.]+)", r.text)
                if m:
                    ra = (int(m.group(1)) + int(m.group(2)) / 60 + float(m.group(3)) / 3600) * 15.0
                    sign = -1 if m.group(4) == "-" else 1
                    dec = sign * (int(m.group(5)) + int(m.group(6)) / 60 + float(m.group(7)) / 3600)
                    return {"ra": ra, "dec": dec, "frame": "ICRS", "source": name}
    except Exception as e:
        print(f"SIMBAD failed for '{name}': {e}")
    # 2) CDS Sesame fallback
    url = f"https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oI/{name}"
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT_SECONDS) as client:
            r = await client.get(url, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            for line in r.text.splitlines():
                if line.startswith("%J"):
                    m = re.match(r"%J\s+([\d.]+)\s+([+-]?[\d.]+)", line)
                    if m:
                        return {"ra": float(m.group(1)), "dec": float(m.group(2)),
                                "frame": "ICRS", "source": name}
    except Exception as e:
        print(f"Sesame failed for '{name}': {e}")
    return None


GAIA_TAP_URL = "https://gea.esac.esa.int/tap-server/tap"


def query_gaia_cone(ra: float, dec: float, radius_deg: float, mag_limit: float = 16.0,
                    top: int = 2000, timeout: int = 30,
                    db_path: str = DATABASE_PATH) -> List[Dict[str, Any]]:
    """Gaia DR3 cone for star overlays (static sky: cached 30d). Never raises."""
    from backend.cache import api_cache_get, api_cache_set
    key = f"gaia-cone:{round(ra, 2)}:{round(dec, 2)}:{round(radius_deg, 2)}:{mag_limit}:{top}"
    try:
        hit = api_cache_get(db_path, key, 30 * 86400)
        if isinstance(hit, list):
            return hit
    except Exception:
        pass
    import threading
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            import pyvo
            svc = pyvo.dal.TAPService(GAIA_TAP_URL)
            q = (
                "SELECT TOP %d source_id, ra, dec, phot_g_mean_mag "
                "FROM gaiadr3.gaia_source "
                "WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', %f, %f, %f)) "
                "AND phot_g_mean_mag < %f "
                "ORDER BY phot_g_mean_mag" % (top, float(ra), float(dec), float(radius_deg), float(mag_limit))
            )
            box["rows"] = svc.search(q, maxrec=top)
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    w = threading.Thread(target=target, daemon=True)
    w.start()
    w.join(timeout=timeout)
    if w.is_alive() or "error" in box:
        # outage: serve last-known cone rather than nothing
        try:
            stale = api_cache_get(db_path, key, 30 * 86400, allow_stale=True)
            if isinstance(stale, list):
                return stale
        except Exception:
            pass
        return []
    out = []
    for r in box.get("rows", []):
        try:
            out.append({"ra": float(r["ra"]), "dec": float(r["dec"]),
                        "g_mag": float(r["phot_g_mean_mag"]) if r["phot_g_mean_mag"] is not None else None})
        except Exception:
            continue
    try:
        api_cache_set(db_path, key, out)
    except Exception:
        pass
    return out


def query_gaia(ra: float, dec: float, radius_arcsec: float = 8.0,
               timeout: int = 25, db_path: str = DATABASE_PATH) -> List[Dict[str, Any]]:
    """Nearest Gaia DR3 sources (stars). Cached 30d. Never raises."""
    from backend.cache import api_cache_get, api_cache_set
    key = f"gaia:{round(ra, 4)}:{round(dec, 4)}:{radius_arcsec}"
    try:
        hit = api_cache_get(db_path, key, 30 * 86400)
        if hit is not None:
            return hit
    except Exception:
        pass
    import threading
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            import pyvo
            svc = pyvo.dal.TAPService(GAIA_TAP_URL)
            q = (
                "SELECT TOP 5 source_id, ra, dec, phot_g_mean_mag, "
                f"DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', {float(ra)}, {float(dec)}))*3600 AS sep "
                "FROM gaiadr3.gaia_source "
                f"WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {float(ra)}, {float(dec)}, {float(radius_arcsec) / 3600.0})) "
                "ORDER BY sep"
            )
            box["rows"] = svc.search(q, maxrec=5)
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    w = threading.Thread(target=target, daemon=True)
    w.start()
    w.join(timeout=timeout)
    if w.is_alive() or "error" in box:
        # outage: serve last-known cone rather than nothing
        try:
            stale = api_cache_get(db_path, key, 30 * 86400, allow_stale=True)
            if isinstance(stale, list):
                return stale
        except Exception:
            pass
        return []
    out = []
    for r in box.get("rows", []):
        try:
            out.append({"source_id": int(r["source_id"]), "ra": float(r["ra"]),
                        "dec": float(r["dec"]),
                        "g_mag": float(r["phot_g_mean_mag"]) if r["phot_g_mean_mag"] is not None else None,
                        "separation_arcsec": float(r["sep"]), "catalog": "gaia-dr3"})
        except Exception:
            continue
    try:
        api_cache_set(db_path, key, out)
    except Exception:
        pass
    return out
