"""
Cross-match with external catalogs for SpectraHunt.

Supports:
- SkyBoT (IMCCE) for solar system objects
- CDS Sesame for fixed targets
- JPL Horizons for ephemerides
"""

import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import httpx

from .config import SKYBOT_ENDPOINT, INGEST_TIMEOUT_SECONDS, USER_AGENT
from .db import get_cached_skybot, cache_skybot_result


async def query_skybot(
    ra: float,
    dec: float,
    mjd: float,
    radius_arcsec: float,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Query SkyBoT for solar system objects near a position at a given epoch.
    
    Args:
        ra: Right Ascension in degrees
        dec: Declination in degrees
        mjd: Modified Julian Date of observation
        radius_arcsec: Search radius in arcseconds
        db_path: Database path for caching
    
    Returns:
        Dict with match info or None if no match found.
    """
    # Check cache first
    if db_path:
        cached = get_cached_skybot(db_path, ra, dec, mjd, radius_arcsec)
        if cached:
            return cached[0] if cached else None
    
    # Convert MJD to ISO date for SkyBoT
    # MJD = JD - 2400000.5
    jd = mjd + 2400000.5
    # Simplified date conversion (in production use astropy.time)
    from astropy.time import Time
    try:
        t = Time(jd, format='jd')
        date_str = t.iso[:10].replace('-', '/')
    except:
        # Fallback: approximate
        date_str = "2025/01/01"
    
    # SkyBoT cone search endpoint
    # https://vo.imcce.fr/webservices/skybot/skybot.php?sys=all&pos=<RA>,<Dec>&dist=<radius>&date=<date>
    params = {
        "-sys": "all",
        "-pos": f"{ra},{dec}",
        "-dist": f"{radius_arcsec / 3600:.4f}",  # Convert to degrees
        "-date": date_str,
        "-format": "json"
    }
    
    headers = {"User-Agent": USER_AGENT}
    
    try:
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{SKYBOT_ENDPOINT}skybot_cone_search.php",
                params=params,
                headers=headers
            )
            response.raise_for_status()
            
            results = response.json()
            
            if not results or len(results) == 0:
                # No matches
                if db_path:
                    cache_skybot_result(db_path, ra, dec, mjd, radius_arcsec, [])
                return None
            
            # Return best match (closest)
            best_match = results[0]
            match_info = {
                "name": best_match.get("Name", best_match.get("name", "Unknown")),
                "type": best_match.get("Type", best_match.get("type", "asteroid")),
                "separation_arcsec": float(best_match.get("Dist", 0)) * 3600,
                "epoch": date_str,
                "mag": best_match.get("Mag", best_match.get("Vmag", None)),
                "motion_arcsec_per_day": float(best_match.get("Motion", 0))
            }
            
            if db_path:
                conn = get_connection(db_path)
                cur = conn.cursor()
                cache_skybot_result(cur, ra, dec, mjd, radius_arcsec, [match_info])
                conn.commit()
                conn.close()
            
            return match_info
            
    except httpx.HTTPError as e:
        print(f"SkyBoT query failed: {e}")
        return None
    except Exception as e:
        print(f"SkyBoT parsing failed: {e}")
        return None


async def resolve_object_name(name: str) -> Optional[Dict[str, Any]]:
    """
    Resolve an object name to coordinates using CDS Sesame.
    
    Works for fixed targets (stars, galaxies, nebulae).
    For solar system objects, use query_horizons instead.
    
    Returns dict with ra, dec, frame, or None if not resolved.
    """
    url = f"https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oI{name}"
    
    headers = {"User-Agent": USER_AGENT}
    
    try:
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            content = response.text
            
            # Parse Sesame response
            for line in content.split('\n'):
                if line.startswith('!ID'):
                    continue
                if line.startswith('!'):
                    continue
                parts = line.split()
                if len(parts) >= 3:
                    ra_str = parts[1]
                    dec_str = parts[2]
                    
                    # Parse sexagesimal coordinates
                    try:
                        ra = float(ra_str.replace(':', ' ').replace(' ', '.'))
                        dec = float(dec_str.replace(':', ' ').replace(' ', '.'))
                        # This is simplified - proper parsing needed
                    except:
                        continue
                    
                    return {
                        "ra": ra,
                        "dec": dec,
                        "frame": "ICRS",
                        "source": parts[0] if len(parts) > 0 else name
                    }
            
            return None
            
    except Exception as e:
        print(f"Sesame resolution failed for '{name}': {e}")
        return None


async def query_horizons(
    object_name: str,
    mjd: float
) -> Optional[Dict[str, Any]]:
    """
    Query JPL Horizons for ephemeris of a solar system object.
    
    Returns position at the specified epoch.
    """
    from astroquery.jplhorizons import Horizons
    
    try:
        # Convert MJD to JD
        jd = mjd + 2400000.5
        
        # Set up Horizons query
        obj = Horizons(id=object_name, location='@sun', epochs={'jd_float': jd})
        
        # Get ephemeris
        eph = obj.ephemerides(refsystem='ICRF')
        
        if len(eph) == 0:
            return None
        
        row = eph[0]
        
        return {
            "ra": float(row['RA']),
            "dec": float(row['DEC']),
            "ra_rate": float(row.get('RA_rate', 0)),
            "dec_rate": float(row.get('DEC_rate', 0)),
            "magnitude": float(row.get('Vmag', 0)),
            "distance_au": float(row.get('r', 0)),
            "epoch_jd": jd
        }
        
    except ImportError:
        print("astroquery not available for Horizons query")
        return None
    except Exception as e:
        print(f"Horizons query failed for '{object_name}': {e}")
        return None


def mjd_to_iso(mjd: float) -> str:
    """Convert MJD to ISO format string."""
    from astropy.time import Time
    try:
        t = Time(mjd, format='mjd')
        return t.iso
    except:
        return datetime.now(timezone.utc).isoformat()
