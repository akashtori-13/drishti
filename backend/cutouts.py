"""
Cutout fetching and rendering for SpectraHunt.

Fetches SPHEREx cutouts via IRSA cutout service,
parses FITS extensions, masks bad pixels, renders PNGs.
"""

import hashlib
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.visualization import ZScaleInterval, AsinhStretch, ImageNormalize
from PIL import Image

from .config import (
    IRSA_CUTOUT_BASE, CUTOUT_SIZE_DEG, CUTOUT_CACHE_DIR, PNG_CACHE_DIR,
    INGEST_TIMEOUT_SECONDS, USER_AGENT, FLAGS_BAD_MASK, PIXEL_SCALE_ARCSEC,
    BANDS
)


def get_cutout_cache_key(frame_id: str, ra: float, dec: float, size: float) -> str:
    """Generate cache key for a cutout."""
    key_str = f"{frame_id}_{ra:.6f}_{dec:.6f}_{size:.4f}"
    return hashlib.md5(key_str.encode()).hexdigest()[:16]


async def fetch_cutout(
    access_url: str,
    ra: float,
    dec: float,
    size_deg: float = CUTOUT_SIZE_DEG,
    cache_dir: str = CUTOUT_CACHE_DIR
) -> Optional[Path]:
    """
    Fetch a cutout from IRSA cutout service.
    
    The cutout service appends ?center=RA,DEC&size=DEG to access_url.
    Returns path to cached FITS file.
    """
    cache_key = get_cutout_cache_key(access_url.split('/')[-1], ra, dec, size_deg)
    cache_path = Path(cache_dir) / f"{cache_key}.fits"
    
    if cache_path.exists():
        return cache_path
    
    # Construct cutout URL
    cutout_url = f"{access_url}?center={ra},{dec}&size={size_deg}"
    
    headers = {"User-Agent": USER_AGENT}
    
    try:
        async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS * 3) as client:
            response = await client.get(cutout_url, headers=headers)
            response.raise_for_status()
            
            # Cache the cutout
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(response.content)
            
            return cache_path
            
    except httpx.HTTPError as e:
        print(f"Failed to fetch cutout from {cutout_url}: {e}")
        return None


def parse_cutout_fits(fits_path: Path) -> Dict[str, Any]:
    """
    Parse a SPHEREx cutout FITS file.
    
    Expected HDUs:
    0. Primary (minimal header)
    1. IMAGE - calibrated surface brightness (MJy/sr)
    2. FLAGS - per-pixel bitmask
    3. VARIANCE - (MJy/sr)^2
    4. ZODI - modeled zodiacal background
    5. PSF - PSF cube (may not be in cutouts)
    6. WCS-WAVE or separate CWAVE/CBAND - wavelength info
    
    Returns dict with data arrays and metadata.
    """
    hdul = fits.open(str(fits_path))
    
    result = {
        "image": None,
        "flags": None,
        "variance": None,
        "zodi": None,
        "wcs": None,
        "wavelength_um": None,
        "bandwidth_um": None,
        "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
        "header": {}
    }
    
    try:
        # Get IMAGE extension
        if 'IMAGE' in hdul:
            image_hdu = hdul['IMAGE']
            result["image"] = image_hdu.data.astype(np.float32)
            result["wcs"] = WCS(image_hdu.header)
            result["header"] = dict(image_hdu.header)
            
            # Try to get pixel scale from WCS
            if result["wcs"] is not None:
                try:
                    scales = result["wcs"].wcs.cdelt
                    if scales is not None:
                        # Convert from degrees/pixel to arcsec/pixel
                        result["pixel_scale_arcsec"] = float(np.mean(np.abs(scales))) * 3600
                except:
                    pass
        
        # Get FLAGS extension
        if 'FLAGS' in hdul:
            result["flags"] = hdul['FLAGS'].data.astype(np.uint16)
        
        # Get VARIANCE extension
        if 'VARIANCE' in hdul:
            result["variance"] = hdul['VARIANCE'].data.astype(np.float32)
        
        # Get ZODI extension
        if 'ZODI' in hdul:
            result["zodi"] = hdul['ZODI'].data.astype(np.float32)
        
        # Try to get wavelength info from WCS-WAVE or header
        if 'WCS-WAVE' in hdul:
            wave_hdu = hdul['WCS-WAVE']
            if wave_hdu.data is not None:
                # This is a lookup table - extract central wavelength at center pixel
                shape = wave_hdu.data.shape
                center_y, center_x = shape[0] // 2, shape[1] // 2
                result["wavelength_um"] = float(wave_hdu.data[center_y, center_x])
        else:
            # Try header keywords
            if 'WAVECENT' in result["header"]:
                result["wavelength_um"] = float(result["header"]["WAVECENT"])
            elif 'CRVAL3' in result["header"]:  # Some files use 3rd axis for wavelength
                result["wavelength_um"] = float(result["header"]["CRVAL3"])
        
        # Bandwidth
        if 'WAVEBAND' in result["header"]:
            result["bandwidth_um"] = float(result["header"]["WAVEBAND"])
        elif 'CDELT3' in result["header"]:
            result["bandwidth_um"] = float(result["header"]["CDELT3"])
            
    finally:
        hdul.close()
    
    return result


def mask_bad_pixels(
    image: np.ndarray,
    flags: Optional[np.ndarray],
    variance: Optional[np.ndarray]
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Mask bad pixels based on FLAGS and variance.
    
    Returns (masked_image, mask) where mask is True for bad pixels.
    """
    mask = np.zeros(image.shape, dtype=bool)
    
    # Flag-based masking
    if flags is not None:
        # Bad bits from config (verify from SPHEREx Explanatory Supplement)
        bad_mask = (flags & FLAGS_BAD_MASK) != 0
        mask |= bad_mask
    
    # Variance-based masking (variance <= 0 is invalid)
    if variance is not None:
        mask |= (variance <= 0)
    
    # NaN/Inf masking
    mask |= ~np.isfinite(image)
    
    # Apply mask
    masked_image = image.copy()
    masked_image[mask] = np.nan
    
    return masked_image, mask


def render_png(
    image: np.ndarray,
    mask: np.ndarray,
    png_path: Path,
    stretch: str = "asinh",
    vmin_percentile: float = 98,
    vmax_percentile: float = 99.5,
    cmap_name: str = "gray"
):
    """
    Render a normalized PNG from image data.
    
    Uses ZScale interval and asinh stretch for good dynamic range.
    Masked pixels are rendered as dark gray.
    """
    # Compute normalization
    valid_data = image[~mask]
    if len(valid_data) == 0:
        # All masked - create blank image
        img_array = np.zeros((image.shape[0], image.shape[1], 3), dtype=np.uint8)
    else:
        # ZScale interval
        try:
            interval = ZScaleInterval(nsamples=1000, contrast=0.25)
            vmin, vmax = interval.get_limits(valid_data)
        except:
            # Fallback to percentiles
            vmin = np.nanpercentile(valid_data, 100 - vmin_percentile)
            vmax = np.nanpercentile(valid_data, 100 - vmax_percentile)
        
        # Normalize
        if stretch == "asinh":
            norm = ImageNormalize(vmin=vmin, vmax=vmax, stretch=AsinhStretch())
        else:
            from astropy.visualization import LinearStretch
            norm = ImageNormalize(vmin=vmin, vmax=vmax, stretch=LinearStretch())
        
        normalized = norm(image).filled(0.1)  # masked pixels become 0.1 (dark gray)
        
        # Convert to RGB (grayscale)
        img_array = (normalized * 255).astype(np.uint8)
        img_array = np.stack([img_array, img_array, img_array], axis=-1)
    
    # Save PNG
    img = Image.fromarray(img_array, mode='RGB')
    png_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(png_path, format='PNG', optimize=True)


async def get_or_render_cutout_png(
    access_url: str,
    ra: float,
    dec: float,
    band: int,
    size_deg: float = CUTOUT_SIZE_DEG,
    cache_dir: str = CUTOUT_CACHE_DIR,
    png_dir: str = PNG_CACHE_DIR
) -> Optional[Dict[str, Any]]:
    """
    Fetch cutout, parse it, and render PNG.
    
    Returns dict with PNG path, wavelength, pixel scale, etc.
    """
    # Fetch FITS cutout
    fits_path = await fetch_cutout(access_url, ra, dec, size_deg, cache_dir)
    if not fits_path:
        return None
    
    # Parse FITS
    cutout_data = parse_cutout_fits(fits_path)
    if cutout_data["image"] is None:
        return None
    
    # Mask bad pixels
    image, mask = mask_bad_pixels(
        cutout_data["image"],
        cutout_data["flags"],
        cutout_data["variance"]
    )
    
    # Generate PNG cache key
    cache_key = get_cutout_cache_key(access_url.split('/')[-1], ra, dec, size_deg)
    png_path = Path(png_dir) / f"{cache_key}.png"
    
    # Render PNG
    if not png_path.exists():
        render_png(image, mask, png_path)
    
    return {
        "png_path": str(png_path),
        "png_url": f"/data/img/{cache_key}.png",
        "wavelength_um": cutout_data.get("wavelength_um"),
        "bandwidth_um": cutout_data.get("bandwidth_um"),
        "pixel_scale_arcsec": cutout_data["pixel_scale_arcsec"],
        "image_shape": image.shape,
        "fits_path": str(fits_path)
    }


def compute_wavelength_match_tolerance(bandwidth_um: float) -> float:
    """
    Compute wavelength matching tolerance.
    
    Per spec: |Δλ| < 0.5 × CBAND for wavelength-matched pairs.
    """
    from .config import WAVELENGTH_MATCH_TOLERANCE_FACTOR
    return WAVELENGTH_MATCH_TOLERANCE_FACTOR * bandwidth_um


def wavelengths_match(
    wl1: float, bw1: float,
    wl2: float, bw2: float
) -> bool:
    """
    Check if two observations have matching wavelengths.
    
    Returns True if |wl1 - wl2| < 0.5 × min(bw1, bw2)
    """
    tolerance = compute_wavelength_match_tolerance(min(bw1, bw2))
    return abs(wl1 - wl2) < tolerance
