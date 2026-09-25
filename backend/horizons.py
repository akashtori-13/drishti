"""JPL Horizons positions for moving targets (DISTA Direction A prototype).

Geocentric (500@399) is used: SPHEREx's LEO baseline shifts a >1 AU body by
<0.01", far below the 6.2"/px pixel. Results are cached to data/ so re-runs
and tests never touch the network.
"""
from __future__ import annotations

import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
CACHE = ROOT / "data" / "horizons_cache.json"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


def _load_cache() -> dict:
    try:
        return json.loads(CACHE.read_text())
    except Exception:
        return {}


def _save_cache(cache: dict) -> None:
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, indent=2))


def _fetch_table(target: str, jd_start: float, jd_end: float, step_min: int = 1440) -> list:
    params = {
        "format": "text", "COMMAND": target, "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "500@399",
        "START_TIME": f"JD{jd_start:.4f}", "STOP_TIME": f"JD{jd_end:.4f}",
        "STEP_SIZE": f"{int(step_min)}m", "QUANTITIES": "1",
    }
    url = HORIZONS_URL + "?" + urllib.parse.urlencode(params)
    last = ""
    for _ in range(3):
        try:
            last = urllib.request.urlopen(url, timeout=120).read().decode()
        except Exception:
            continue
        m = re.search(r"\$\$SOE(.*?)\$\$EOE", last, re.S)
        if m:
            break
    else:
        raise RuntimeError(f"Horizons: no ephemeris in response ({last[:200]})")
    rows = []
    # QUANTITIES=1 observer table: `DATE TIME RA-h RA-m RA-s DEC-d DEC-m DEC-s`
    # with no JD column, so synthesize JD from start + step (evenly spaced).
    for idx, line in enumerate(m.group(1).strip().splitlines()):
        p = line.split()
        try:
            ra = (float(p[2]) + float(p[3]) / 60 + float(p[4]) / 3600) * 15
            sgn = -1 if p[5].startswith("-") else 1
            dec = sgn * (abs(float(p[5])) + float(p[6]) / 60 + float(p[7]) / 3600)
            rows.append((jd_start + idx * step_min / 1440.0, ra, dec))
        except (ValueError, IndexError):
            continue
    if len(rows) < 2:
        raise RuntimeError("Horizons: fewer than 2 ephemeris rows")
    return rows


def positions(target: str, mjds: list[float]) -> list[tuple[float, float]]:
    """Geocentric (ra, dec) deg at each MJD. Linear interp over daily steps.

    Orbital motion is smooth at day scales; interp error is sub-arcsecond,
    far below the aperture. Never raises for cache hits; network failures
    raise RuntimeError with context.
    """
    key = f"{target}:{(min(mjds)):.2f}-{(max(mjds)):.2f}"
    cache = _load_cache()
    if key not in cache:
        jd_lo = min(mjds) + 2400000.5 - 1.0
        jd_hi = max(mjds) + 2400000.5 + 1.0
        try:
            table = _fetch_table(target, jd_lo, jd_hi)
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Horizons query failed for {target}: {e}") from e
        cache[key] = table
        _save_cache(cache)
    table = cache[key]
    out = []
    for mjd in mjds:
        jd = mjd + 2400000.5
        if jd <= table[0][0]:
            out.append((table[0][1], table[0][2]))
            continue
        if jd >= table[-1][0]:
            out.append((table[-1][1], table[-1][2]))
            continue
        for (j0, ra0, d0), (j1, ra1, d1) in zip(table, table[1:]):
            if j0 <= jd <= j1:
                f = (jd - j0) / (j1 - j0)
                dra = (ra1 - ra0 + 540) % 360 - 180
                out.append((spatial_ra(ra0, dra, f), d0 + (d1 - d0) * f))
                break
    return out


def spatial_ra(ra0: float, dra: float, f: float) -> float:
    return (ra0 + dra * f) % 360


def separation_arcsec(ra0: float, dec0: float, ra1: float, dec1: float) -> float:
    cosc = (math.sin(math.radians(dec0)) * math.sin(math.radians(dec1))
            + math.cos(math.radians(dec0)) * math.cos(math.radians(dec1))
            * math.cos(math.radians(ra0 - ra1)))
    return math.degrees(math.acos(max(-1.0, min(1.0, cosc)))) * 3600.0
