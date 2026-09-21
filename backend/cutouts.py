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


async def fetch_ibe(cutout_url: str, dest: Path, timeout: int = API_TIMEOUT_SECONDS * 2) -> Path:
    """Download an IBE cutout URL to dest."""
    import httpx
    dest.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(cutout_url, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


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
