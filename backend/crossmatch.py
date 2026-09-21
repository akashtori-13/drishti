"""
Cross-match with external catalogs: SkyBoT (IMCCE), CDS Sesame, JPL Horizons.
All network access is lazy + cached in SQLite via backend.db helpers.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config import SKYBOT_ENDPOINT, INGEST_TIMEOUT_SECONDS, USER_AGENT


def _get_conn(db_path: Optional[str]):
    if not db_path:
        return None, None
    from backend.db import get_connection
    conn = get_connection(db_path)
    return conn, conn.cursor()


async def query_skybot(ra: float, dec: float, mjd: float, radius_arcsec: float,
                       db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Cone-search SkyBoT. Returns best-match dict or None. Caches results."""
    from backend.db import get_cached_skybot, cache_skybot_result
    if db_path:
        try:
            cached = get_cached_skybot(db_path, ra, dec, mjd, radius_arcsec)
            if cached:
                return cached[0] if isinstance(cached, list) else cached
            if cached == []:
                return None
        except Exception:
            pass
    try:
        from astropy.time import Time
        jd = float(mjd) + 2400000.5
        try:
            date_str = Time(jd, format="jd").iso[:10].replace("-", "/")
        except Exception:
            date_str = "2025/01/01"
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
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
            r = await client.get(f"{SKYBOT_ENDPOINT}skybot_cone_search.php",
                                 params=params, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            results = r.json()
    except Exception as e:
        print(f"SkyBoT query failed: {e}")
        return None
    if not results:
        if db_path:
            try:
                cache_skybot_result(db_path, ra, dec, mjd, radius_arcsec, [])
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
    if db_path:
        try:
            cache_skybot_result(db_path, ra, dec, mjd, radius_arcsec, [match])
        except Exception:
            pass
    return match


async def resolve_object_name(name: str) -> Optional[Dict[str, Any]]:
    """Resolve fixed-target name via CDS Sesame. Returns {ra, dec} or None."""
    import httpx
    import re
    url = f"https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oI/{name}"
    try:
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
            r = await client.get(url, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            for line in r.text.splitlines():
                if line.startswith("%J"):
                    m = re.match(r"%J\s+([\d.]+)\s+([+-]?[\d.]+)", line)
                    if m:
                        return {"ra": float(m.group(1)), "dec": float(m.group(2)),
                                "frame": "ICRS", "source": name}
    except Exception as e:
        print(f"Sesame resolution failed for '{name}': {e}")
    return None


async def query_horizons(object_name: str, mjd: float) -> Optional[Dict[str, Any]]:
    """JPL Horizons ephemeris at MJD. Returns {ra, dec, mjd} or None."""
    try:
        from astroquery.jplhorizons import Horizons
        jd = float(mjd) + 2400000.5
        obj = Horizons(id=object_name, location="500", epochs=jd)
        eph = obj.ephemerides()
        return {"ra": float(eph["RA"][0]), "dec": float(eph["DEC"][0]),
                "mjd": float(mjd), "source": "horizons"}
    except Exception as e:
        print(f"Horizons query failed for '{object_name}': {e}")
        return None
