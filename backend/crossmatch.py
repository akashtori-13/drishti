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
    from backend.cache import cache_skybot, get_cached_skybot
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
    except Exception as e:
        print(f"SkyBoT query failed: {e}")
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


async def query_horizons(object_name: str, mjd: float) -> Optional[Dict[str, Any]]:
    """JPL Horizons ephemeris at MJD. Returns {ra, dec, mjd} or None."""
    try:
        from astroquery.jplhorizons import Horizons
        eph = Horizons(id=object_name, location="500",
                       epochs=float(mjd) + 2400000.5).ephemerides()
        return {"ra": float(eph["RA"][0]), "dec": float(eph["DEC"][0]),
                "mjd": float(mjd), "source": "horizons"}
    except Exception as e:
        print(f"Horizons failed for '{object_name}': {e}")
        return None
