"""
Astrometric alignment: resample epoch B onto epoch A's pixel grid.

Primary path uses WCS + reproject (exact). Fallback uses phase-correlation
shift when WCS is missing or axes mismatch. Pure functions, never raise.
"""
from typing import Any, Dict, Optional, Tuple


def _celestial(wcs):
    try:
        return wcs.celestial
    except Exception:
        return wcs


def align_images(image_a, wcs_a, image_b, wcs_b) -> Tuple[Any, Dict[str, Any]]:
    """Return (b_on_a, info). b_on_a matches A's shape/grid. info describes method."""
    import numpy as np
    a = np.asarray(image_a, dtype=float)
    b = np.asarray(image_b, dtype=float)
    if a.shape == b.shape and (wcs_a is None or wcs_b is None):
        # same shape, no WCS: refind shift, apply it
        dy, dx = _corr_shift(a, b)
        return _shift(b, -dy, -dx), {"method": "correlation", "dy": dy, "dx": dx}
    if wcs_a is not None and wcs_b is not None:
        try:
            from reproject import reproject_interp
            wa, wb = _celestial(wcs_a), _celestial(wcs_b)
            arr, _ = reproject_interp((b, wb), wa, shape_out=a.shape, order="bilinear")
            # non-overlap stays NaN (never median-filled: that forces B-A~0
            # and fakes agreement — audit B3). Downstream is NaN-safe
            # (_peaks masks non-finite; aperture_flux requires finite).
            bad_frac = float(np.isfinite(arr).sum()) / max(1, arr.size)
            return arr, {"method": "wcs-reproject", "overlap_frac": round(bad_frac, 4)}
        except Exception as e:  # noqa: BLE001
            print(f"WCS reproject failed ({e}); trying correlation")
    # last resort: crop/pad + correlation shift
    h, w = a.shape[:2]
    bb = np.asarray(b, dtype=float)
    if bb.shape != a.shape:
        canvas = np.full_like(a, np.nanmedian(a))
        hh, ww = min(h, bb.shape[0]), min(w, bb.shape[1])
        canvas[:hh, :ww] = bb[:hh, :ww]
        bb = canvas
    dy, dx = _corr_shift(a, bb)
    return _shift(bb, -dy, -dx), {"method": "correlation-fallback", "dy": dy, "dx": dx}


def _corr_shift(a, b) -> Tuple[float, float]:
    """Sub-pixel shift of b relative to a via FFT phase correlation."""
    import numpy as np
    try:
        from scipy.signal import correlate
        a0 = np.nan_to_num(a - np.nanmedian(a))
        b0 = np.nan_to_num(b - np.nanmedian(b))
        c = correlate(a0 - a0.mean(), b0 - b0.mean(), mode="same", method="fft")
        y, x = divmod(int(c.argmax()), c.shape[1])
        return float(y - c.shape[0] // 2), float(x - c.shape[1] // 2)
    except Exception:
        return 0.0, 0.0


def _shift(image, dy: float, dx: float):
    import numpy as np
    try:
        from scipy.ndimage import shift as _ndshift
        return _ndshift(np.asarray(image, dtype=float), (dy, dx), order=1, mode="nearest")
    except Exception:
        out = np.asarray(image, dtype=float)
        return np.roll(np.roll(out, int(round(dy)), axis=0), int(round(dx)), axis=1)


def sky_to_pixel(ra: float, dec: float, wcs, shape) -> Optional[Tuple[float, float]]:
    """ICRS -> pixel (x, y) or None on any failure. Never falls back to
    array center: silent wrong-position photometry (audit B2) is worse
    than a skipped frame — callers already `continue` on None."""
    try:
        if wcs is not None:
            x, y = _celestial(wcs).all_world2pix([[float(ra), float(dec)]], 0)[0]
            if abs(x) < 1e6 and abs(y) < 1e6:
                return float(x), float(y)
    except Exception:
        pass
    return None
