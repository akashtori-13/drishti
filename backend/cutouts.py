"""
Cutouts: fetch IBE FITS, parse extensions, mask bad pixels, render PNG.

Heavy deps (astropy, numpy, PIL) import lazily so the API and tests stay light.
"""

import hashlib
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from backend.config import (
    API_TIMEOUT_SECONDS,
    CUTOUT_SIZE_DEG,
    PIXEL_SCALE_ARCSEC,
    USER_AGENT,
    WAVELENGTH_TOLERANCE_FACTOR,
)

# Bad-pixel bits per SPHEREx Explanatory Supplement
FLAGS_BAD_MASK = sum(1 << b for b in (0, 1, 2, 4, 8))


def tolerance(bandwidth_um: float, factor: float = WAVELENGTH_TOLERANCE_FACTOR) -> float:
    return float(bandwidth_um) * float(factor)


def wavelengths_match(wl_a: float, bw_a: float, wl_b: float, bw_b: float,
                      factor: float = WAVELENGTH_TOLERANCE_FACTOR) -> bool:
    """Same-band blink gate: |Δλ| < factor × mean bandwidth."""
    mean_bw = (float(bw_a) + float(bw_b)) / 2.0
    if mean_bw <= 0:
        return False
    return abs(float(wl_a) - float(wl_b)) < factor * mean_bw


def cache_key(frame_id: str, ra: float, dec: float, size: float) -> str:
    return hashlib.md5(f"{frame_id}_{ra:.6f}_{dec:.6f}_{size:.4f}".encode()).hexdigest()[:16]


# Persistent FITS cache: IRSA is flaky and demos have no network to spare.
# Every downloaded cutout is kept under data/fits-cache/ (gitignored via
# *.fits) keyed by URL hash, so re-runs and forensics never re-download.
# The running app never needs it: shipped pages read precomputed JSONs.
FITS_CACHE_DIR = Path(__file__).parent.parent / "data" / "fits-cache"


def fits_cache_path(cutout_url: str) -> Path:
    return FITS_CACHE_DIR / (hashlib.sha256(cutout_url.encode()).hexdigest() + ".fits")


async def fetch_ibe(cutout_url: str, dest: Path, timeout: int = API_TIMEOUT_SECONDS * 2,
                retries: int = 2, use_cache: bool = True) -> Path:
    """Download an IBE cutout URL to dest. Retries 5xx/network with backoff; 4xx fails fast."""
    import asyncio
    import shutil

    import httpx
    dest.parent.mkdir(parents=True, exist_ok=True)
    if use_cache:
        try:
            hit = fits_cache_path(cutout_url)
            if hit.is_file() and hit.stat().st_size > 0:
                shutil.copyfile(hit, dest)
                return dest
        except Exception:
            pass
    last: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(cutout_url, headers={"User-Agent": USER_AGENT})
                if r.status_code == 422:
                    # footprint mismatch ("Arrays do not overlap"): retrying is pointless
                    r.raise_for_status()
                if r.status_code >= 500:
                    raise httpx.HTTPStatusError(f"IBE {r.status_code}", request=r.request, response=r)
                r.raise_for_status()
                dest.write_bytes(r.content)
                if use_cache:
                    try:
                        FITS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(dest, fits_cache_path(cutout_url))
                    except Exception:
                        pass
            return dest
        except httpx.HTTPStatusError as e:
            if e.response is not None and 400 <= e.response.status_code < 500:
                raise
            last = e
        except Exception as e:  # noqa: BLE001 - network flakes, backoff below
            last = e
        await asyncio.sleep(2 ** attempt * 2)
    assert last is not None
    raise last


def parse_fits(fits_path: Path) -> Dict[str, Any]:
    """Parse IMAGE/FLAGS/VARIANCE/ZODI + wavelength. Missing → None."""
    from astropy.io import fits
    from astropy.wcs import WCS
    result: Dict[str, Any] = {
        "image": None, "flags": None, "variance": None, "zodi": None,
        "wcs": None, "wavelength_um": None, "bandwidth_um": None,
        "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC, "header": {},
    }
    try:
        hdul = fits.open(str(fits_path))
    except Exception as e:
        print(f"Cannot open FITS {fits_path}: {e}")
        return result
    try:
        if "IMAGE" in hdul:
            hdu = hdul["IMAGE"]
            result["image"] = hdu.data
            result["header"] = dict(hdu.header)
            try:
                wcs = WCS(hdu.header)
                result["wcs"] = wcs
                if wcs.wcs.cdelt is not None:
                    result["pixel_scale_arcsec"] = float(abs(float(wcs.wcs.cdelt[0]))) * 3600.0
            except Exception:
                pass
        for ext in ("FLAGS", "VARIANCE", "ZODI"):
            if ext in hdul:
                try:
                    result[ext.lower()] = hdul[ext].data
                except Exception:
                    pass
        # WCS-WAVE: single-row table; X[0]/Y[0] are the 11 grid coords over
        # the full 2040px detector, VALUES[0] is (11, 11, 2): [.., 0] is
        # wavelength in um, [.., 1] the per-pixel bandwidth.
        try:
            if "WCS-WAVE" in hdul:
                wtab = hdul["WCS-WAVE"].data
                xs = [int(v) for v in wtab["X"][0]]
                ys = [int(v) for v in wtab["Y"][0]]
                vals = wtab["VALUES"][0]
                result["wave_grid"] = {
                    "x": xs, "y": ys,
                    "lam": [[float(vals[j][i][0]) for i in range(len(xs))] for j in range(len(ys))],
                    "dl": [[float(vals[j][i][1]) for i in range(len(xs))] for j in range(len(ys))],
                }
        except Exception:
            pass
        hdr = result["header"]
        for key in ("WAVECENT", "CRVAL3"):
            if key in hdr:
                try:
                    result["wavelength_um"] = float(hdr[key])
                    break
                except (TypeError, ValueError):
                    pass
        for key in ("WAVEBAND", "CDELT3"):
            if key in hdr:
                try:
                    result["bandwidth_um"] = float(hdr[key])
                    break
                except (TypeError, ValueError):
                    pass
    finally:
        try:
            hdul.close()
        except Exception:
            pass
    return result


def wave_at(wave_grid, full_x: float, full_y: float) -> Tuple[Optional[float], Optional[float]]:
    """Nearest WCS-WAVE grid point -> (wavelength_um, bandwidth_um).

    Grid coordinates are full-detector pixels. IBE *cutout* headers carry
    no parent-detector offset (their CRPIX is cutout-frame, so
    WCS(CRVAL)==CRPIX is a tautology and any cutout->parent mapping
    collapses to a constant). Only call this with true full-frame pixels;
    for cutouts use the band representative wavelength instead.
    Returns (None, None) off-grid.
    """
    try:
        xs = wave_grid["x"]
        ys = wave_grid["y"]
        lam = wave_grid["lam"]
        dl = wave_grid["dl"]
        bi = min(range(len(xs)), key=lambda i: abs(xs[i] - full_x))
        bj = min(range(len(ys)), key=lambda j: abs(ys[j] - full_y))
        if not (0 <= full_x <= 2040 and 0 <= full_y <= 2040):
            return None, None
        return float(lam[bj][bi]), float(dl[bj][bi])
    except Exception:
        return None, None


def mask_bad_pixels(image, flags=None, variance=None) -> Tuple[Any, Any]:
    """Mask FLAGS bitmask, non-positive variance, NaN/Inf. Fills with median."""
    import numpy as np
    mask = np.zeros(np.asarray(image).shape, dtype=bool)
    if flags is not None:
        try:
            mask |= ((np.asarray(flags) & FLAGS_BAD_MASK) != 0)
        except Exception:
            pass
    if variance is not None:
        try:
            mask |= (np.asarray(variance) <= 0)
        except Exception:
            pass
    mask |= ~np.isfinite(np.asarray(image, dtype=float))
    filled = np.asarray(image, dtype=float).copy()
    try:
        fill = np.nanmedian(filled[~mask]) if (~mask).any() else 0.0
        filled[mask] = fill
    except Exception:
        pass
    return filled, mask


def render_png(image, out_path: Path) -> Optional[Path]:
    """Zscale + asinh stretch to PNG. Returns path or None."""
    try:
        import numpy as np
        from astropy.visualization import AsinhStretch, ImageNormalize, ZScaleInterval
        from PIL import Image
        data = np.nan_to_num(np.asarray(image, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
        norm = ImageNormalize(data, interval=ZScaleInterval(), stretch=AsinhStretch())
        rgb = (norm(data) * 255).clip(0, 255).astype("uint8")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgb).save(out_path)
        return out_path
    except Exception as e:
        print(f"PNG render failed: {e}")
        return None


def cutout_png_name(showcase_id: str, epoch_label: str) -> str:
    slug = epoch_label.split("·")[0].strip().replace(" ", "-")
    return f"{showcase_id}_{slug}.png"
