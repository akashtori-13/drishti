"""
Cutout fetching, parsing and rendering for SpectraHunt.

Heavy astronomy deps (astropy, numpy, PIL) are imported lazily so the
FastAPI server and unit tests import cleanly without them.
"""

import hashlib
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from backend.config import (
    CUTOUT_SIZE_DEG, CUTOUT_CACHE_DIR, PNG_CACHE_DIR,
    INGEST_TIMEOUT_SECONDS, USER_AGENT, FLAGS_BAD_MASK, PIXEL_SCALE_ARCSEC,
)


def compute_wavelength_match_tolerance(bandwidth_um: float, factor: float = 0.5) -> float:
    """Tolerance = factor x bandwidth. Matches ARCHITECTURE.md LVF rule."""
    return float(bandwidth_um) * float(factor)


def wavelengths_match(wl_a: float, bw_a: float, wl_b: float, bw_b: float,
                      factor: float = 0.5) -> bool:
    """Two cutouts match if |dλ] < factor x mean bandwidth."""
    mean_bw = (float(bw_a) + float(bw_b)) / 2.0
    if mean_bw <= 0:
        return False
    return abs(float(wl_a) - float(wl_b)) < factor * mean_bw


def get_cutout_cache_key(frame_id: str, ra: float, dec: float, size: float) -> str:
    key_str = f"{frame_id}_{ra:.6f}_{dec:.6f}_{size:.4f}"
    return hashlib.md5(key_str.encode()).hexdigest()[:16]


async def fetch_cutout(access_url: str, ra: float, dec: float,
                       size_deg: float = CUTOUT_SIZE_DEG,
                       cache_dir: str = CUTOUT_CACHE_DIR) -> Optional[Path]:
    """Fetch IRSA cutout (?center=RA,DEC&size=DEG), cached on disk."""
    import httpx
    cache_key = get_cutout_cache_key(access_url.split("/")[-1], ra, dec, size_deg)
    cache_path = Path(cache_dir) / f"{cache_key}.fits"
    if cache_path.exists():
        return cache_path
    cutout_url = f"{access_url}?center={ra},{dec}&size={size_deg}"
    try:
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS * 3) as client:
            r = await client.get(cutout_url, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(r.content)
            return cache_path
    except Exception as e:
        print(f"Failed to fetch cutout {cutout_url}: {e}")
        return None


def parse_cutout_fits(fits_path: Path) -> Dict[str, Any]:
    """Parse IMAGE/FLAGS/VARIANCE/ZODI + wavelength. Returns Nones when missing."""
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
            try:
                import numpy as np
                result["image"] = hdu.data.astype("float32")
            except Exception:
                result["image"] = hdu.data
            result["header"] = dict(hdu.header)
            try:
                wcs = WCS(hdu.header)
                result["wcs"] = wcs
                scales = wcs.wcs.cdelt
                if scales is not None:
                    import numpy as np
                    result["pixel_scale_arcsec"] = float(abs(float(scales[0]))) * 3600.0
            except Exception:
                pass
        if "FLAGS" in hdul:
            try:
                result["flags"] = hdul["FLAGS"].data
            except Exception:
                pass
        if "VARIANCE" in hdul:
            try:
                result["variance"] = hdul["VARIANCE"].data
            except Exception:
                pass
        if "ZODI" in hdul:
            try:
                result["zodi"] = hdul["ZODI"].data
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
    """Mask bad pixels via FLAGS bitmask, non-positive variance, NaN/Inf."""
    import numpy as np
    mask = np.zeros(image.shape, dtype=bool)
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
    mask |= ~np.isfinite(np.asarray(image))
    masked = np.asarray(image).copy()
    try:
        masked[mask] = np.nanmedian(masked[~mask]) if (~mask).any() else 0.0
    except Exception:
        pass
    return masked, mask


def render_png(image, out_path: Path, mask=None) -> Optional[Path]:
    """Render zscale/asinh PNG for blink viewer. Returns path or None."""
    try:
        import numpy as np
        from astropy.visualization import ZScaleInterval, AsinhStretch, ImageNormalize
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


def get_or_render_cutout_png(frame_id: str, fits_path: Path, ra: float, dec: float,
                             size_deg: float = CUTOUT_SIZE_DEG) -> Optional[Path]:
    """Parse + mask + render a cached cutout FITS to PNG."""
    key = get_cutout_cache_key(frame_id, ra, dec, size_deg)
    out = Path(PNG_CACHE_DIR) / f"{key}.png"
    if out.exists():
        return out
    parsed = parse_cutout_fits(fits_path)
    if parsed["image"] is None:
        return None
    masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
    return render_png(masked, out)
