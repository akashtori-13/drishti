"""
Mover / variable detection: source extraction + cross-epoch matching.

Lightweight and dependency-tolerant: uses photutils/SEP when available,
falls back to a numpy/scipy peak finder. Never raises — returns [] on failure.
"""
from typing import Any, Dict, List, Tuple


def estimate_background(image) -> Tuple[float, float]:
    """Median + robust sigma (MAD). Pure numpy."""
    import numpy as np
    data = np.asarray(image, dtype=float)
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        return 0.0, 1.0
    med = float(np.median(finite))
    mad = float(np.median(np.abs(finite - med)))
    return med, max(1e-6, mad * 1.4826)


def detect_sources(image, threshold_sigma: float = 3.0, min_pixels: int = 3) -> List[Dict[str, Any]]:
    """Return [{x, y, flux}] in pixel coords. Tries SEP → photutils → scipy → numpy."""
    try:
        import numpy as np
    except Exception:
        return []
    data = np.asarray(image, dtype=float)
    bg, sigma = estimate_background(data)
    thresh = bg + threshold_sigma * sigma
    # 1) SEP
    try:
        import sep  # type: ignore
        bkg = sep.Background(np.ascontiguousarray(data.astype(np.float32)))
        objs, _ = sep.extract(data.astype(np.float32) - bkg.back(), threshold_sigma, minarea=min_pixels, segmentation_map=False)
        return [{"x": float(o["x"]), "y": float(o["y"]), "flux": float(o["flux"])} for o in objs][:500]
    except Exception:
        pass
    # 2) photutils
    try:
        from photutils.segmentation import detect_sources as _ds  # type: ignore
        segm = _ds(data - bg, threshold_sigma * sigma, npixels=min_pixels)
        if segm is None:
            return []
        out = []
        for label in range(1, segm.nlabels + 1):
            ys, xs = (segm.data == label).nonzero()
            if len(xs) < min_pixels:
                continue
            flux = float(data[ys, xs].sum() - bg * len(xs))
            out.append({"x": float(xs.mean()), "y": float(ys.mean()), "flux": flux})
        return sorted(out, key=lambda o: -o["flux"])[:500]
    except Exception:
        pass
    # 3) scipy label
    try:
        from scipy.ndimage import center_of_mass, label  # type: ignore
        mask = np.isfinite(data) & (data > thresh)
        lab, nlab = label(mask)
        out = []
        for i in range(1, min(nlab + 1, 500)):
            ys, xs = (lab == i).nonzero()
            if len(xs) < min_pixels:
                continue
            cy, cx = center_of_mass(data, lab, i)
            flux = float(data[ys, xs].sum() - bg * len(xs))
            out.append({"x": float(cx), "y": float(cy), "flux": flux})
        return sorted(out, key=lambda o: -o["flux"])[:500]
    except Exception:
        pass
    # 4) numpy global-maximum peeling (coarse but dependency-free)
    try:
        work = data.copy()
        work[~np.isfinite(work)] = bg
        out = []
        for _ in range(60):
            j = int(work.argmax())
            y, x = divmod(j, work.shape[1])
            peak = float(work[y, x])
            if peak < thresh:
                break
            out.append({"x": float(x), "y": float(y), "flux": peak - bg})
            y0, y1 = max(0, y - 2), min(work.shape[0], y + 3)
            x0, x1 = max(0, x - 2), min(work.shape[1], x + 3)
            work[y0:y1, x0:x1] = bg
        return out
    except Exception:
        return []


def match_epochs(a: List[Dict[str, Any]], b: List[Dict[str, Any]],
                 max_match_px: float = 3.0, var_sigma: float = 5.0) -> Dict[str, Any]:
    """Cross-match two source lists. Returns {movers, variables, matched}."""
    import math
    used = set()
    matched = 0
    movers: List[Dict[str, Any]] = []
    variables: List[Dict[str, Any]] = []
    for sa in a:
        best, bestd = None, 1e9
        for j, sb in enumerate(b):
            if j in used:
                continue
            d = math.hypot(sa["x"] - sb["x"], sa["y"] - sb["y"])
            if d < bestd:
                best, bestd = j, d
        if best is not None and bestd <= max_match_px:
            used.add(best)
            matched += 1
            sb = b[best]
            fa, fb = max(1e-9, sa["flux"]), max(1e-9, sb["flux"])
            # crude variability: flux ratio beyond threshold
            if max(fa, fb) / min(fa, fb) > 1 + var_sigma * 0.15:
                variables.append({"x": sb["x"], "y": sb["y"], "flux_a": fa, "flux_b": fb,
                                  "ratio": max(fa, fb) / min(fa, fb), "kind": "variable"})
        else:
            movers.append({"x": sa["x"], "y": sa["y"], "flux": sa["flux"], "kind": "mover",
                           "note": "present in A, unmatched in B"})
    for j, sb in enumerate(b):
        if j not in used:
            movers.append({"x": sb["x"], "y": sb["y"], "flux": sb["flux"], "kind": "mover",
                           "note": "present in B, unmatched in A"})
    return {"movers": movers[:200], "variables": variables[:200], "matched": matched}


def arcsec_per_day(ra_a: float, dec_a: float, ra_b: float, dec_b: float, dt_days: float):
    """Measured motion between two sky positions. None when dt invalid."""
    import math
    if not (dt_days and dt_days > 0):
        return None
    mid = math.radians((dec_a + dec_b) / 2.0)
    d_ra = (ra_b - ra_a) * 3600.0 * math.cos(mid)
    d_dec = (dec_b - dec_a) * 3600.0
    return math.hypot(d_ra, d_dec) / dt_days
