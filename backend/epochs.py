"""
Epoch discovery: which SPHEREx images cover a sky position in a given band.

TAP first (no ingestion lag), SIA2 fallback (~1 day lag). Used by the dev API
and the showcase indexer. Returns IBE cutout URLs sorted oldest-first.
"""

from typing import Any, Dict, List, Optional

from backend.config import (
    BANDPASS_NAMES,
    COLLECTION_WIDE,
    SIA2_URL,
    TAP_URL,
    USER_AGENT,
)


def bandpass_name(band: int) -> str:
    return BANDPASS_NAMES.get(int(band), "SPHEREx-D3")


def tap_cutout_urls(ra: float, dec: float, band: int = 3, size_deg: float = 0.05,
                    limit: int = 50, collection: Optional[str] = None,
                    timeout: int = 60, newest: bool = False) -> List[Dict[str, Any]]:
    """Query TAP for covering images. Returns [{cutout_url, mjd, bandpass}]."""
    import threading

    import pyvo

    bp = bandpass_name(band)
    svc = pyvo.dal.TAPService(TAP_URL)
    q = (
        f"SELECT TOP {int(limit)} 'https://irsa.ipac.caltech.edu/' || a.uri AS base_uri, "
        "p.time_bounds_lower AS mjd, p.energy_bandpassname AS bandpass "
        "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
        f"WHERE 1 = CONTAINS(POINT('ICRS', {float(ra)}, {float(dec)}), p.poly) "
        f"AND p.energy_bandpassname = '{bp}' "
        f"ORDER BY p.time_bounds_lower {'DESC' if newest else 'ASC'}"
    )
    # Daemon thread: join() bounds the wait, and a hung query can never
    # wedge the process (ThreadPoolExecutor.__exit__ would wait forever).
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            box["rows"] = svc.search(q, maxrec=int(limit))
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    worker = threading.Thread(target=target, daemon=True)
    worker.start()
    worker.join(timeout=timeout)
    if worker.is_alive():
        raise TimeoutError(f"TAP query exceeded {timeout}s")
    if "error" in box:
        raise box["error"]
    rows = box.get("rows", [])
    out = []
    for row in rows:
        try:
            base = str(row["base_uri"])
            out.append({
                "cutout_url": f"{base}?center={ra},{dec}&size={size_deg}",
                "mjd": float(row["mjd"]),
                "bandpass": str(row["bandpass"]),
            })
        except Exception:
            continue
    return out


def sia2_cutout_urls(ra: float, dec: float, radius_deg: float = 0.5,
                     collection: str = COLLECTION_WIDE) -> List[Dict[str, Any]]:
    """Fallback: SIA2 cone search. Returns [{access_url, ...}] (no cutout params)."""
    import httpx

    params = {
        "COLLECTION": collection,
        "POS": f"circle {ra} {dec} {radius_deg}",
        "RESPONSEFORMAT": "VOTABLE",
    }
    with httpx.Client(timeout=30) as client:
        r = client.get(SIA2_URL, params=params, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        vot = r.text
    try:
        from astropy.table import Table
        from io import BytesIO
        t = Table.read(BytesIO(vot.encode()), format="votable")
        out = []
        for row in t:
            try:
                out.append({"access_url": str(row["access_url"])})
            except Exception:
                continue
        return out
    except Exception:
        return []


def discover_epochs(ra: float, dec: float, band: int = 3, size_deg: float = 0.05,
                    collection: Optional[str] = None, limit: int = 50,
                    timeout: int = 60, newest: bool = False) -> List[Dict[str, Any]]:
    """TAP first, SIA2 fallback. Never raises: returns [] when IRSA is unreachable."""
    try:
        hits = tap_cutout_urls(ra, dec, band=band, size_deg=size_deg,
                               limit=limit, timeout=timeout, newest=newest)
        if hits:
            return hits
    except Exception as e:
        print(f"TAP discovery failed: {e}")
    try:
        return sia2_cutout_urls(ra, dec, collection=collection or COLLECTION_WIDE)
    except Exception as e:
        print(f"SIA2 discovery failed: {e}")
        return []
