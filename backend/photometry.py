"""
Aperture photometry + difference-significance movers.

- aperture_flux(): circular aperture with annulus background, variance-aware errors.
- find_dipoles(): +/- peak pairing on a significance map (movers leave dipoles).
- measure_field(): end-to-end for two aligned frames.
"""
from typing import Any, Dict, List, Optional, Tuple


def aperture_flux(image, x: float, y: float, r_aper: float = 3.0,
                  r_in: float = 6.0, r_out: float = 10.0,
                  variance=None) -> Dict[str, float]:
    """Background-subtracted aperture sum + rough error. Never raises."""
    import numpy as np
    data = np.asarray(image, dtype=float)
    h, w = data.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.hypot(xx - x, yy - y)
    ap = (dist <= r_aper) & np.isfinite(data)
    an = (dist > r_in) & (dist <= r_out) & np.isfinite(data)
    bg = float(np.median(data[an])) if an.any() else float(np.nanmedian(data))
    npix = int(ap.sum())
    flux = float(data[ap].sum() - bg * npix) if npix else 0.0
    if variance is not None:
        try:
            var = np.asarray(variance, dtype=float)
            err = float(np.sqrt(np.nansum(var[ap]) + npix * np.nanvar(data[an])))
        except Exception:
            err = float(np.sqrt(max(1.0, abs(flux))) + npix * 0.1)
    else:
        err = float(np.sqrt(max(1.0, abs(flux))) + npix * 0.1)
    return {"flux": flux, "flux_err": err, "bg": bg, "npix": npix}


def significance_map(img_a, img_b_aligned, var_a=None, var_b=None) -> Any:
    """(B - A) / noise per pixel. Falls back to MAD noise when no variance."""
    import numpy as np
    a = np.asarray(img_a, dtype=float)
    b = np.asarray(img_b_aligned, dtype=float)
    diff = b - a
    if var_a is not None and var_b is not None:
        try:
            noise = np.sqrt(np.maximum(0, np.asarray(var_a, dtype=float))
                            + np.maximum(0, np.asarray(var_b, dtype=float)))
            noise[noise <= 0] = np.nan
            return diff / noise
        except Exception:
            pass
    med = np.nanmedian(diff)
    mad = np.nanmedian(np.abs(diff - med)) or 1.0
    return (diff - med) / (1.4826 * mad)


def _peaks(sig, thresh: float, sign: int, limit: int = 120) -> List[Dict[str, Any]]:
    import numpy as np
    work = np.where(np.isfinite(sig), sig * sign, -np.inf)
    out = []
    for _ in range(limit):
        j = int(work.argmax())
        v = float(work.flat[j])
        if v < thresh:
            break
        y, x = divmod(j, work.shape[1])
        out.append({"x": float(x), "y": float(y), "sigma": v})
        y0, y1 = max(0, y - 3), min(work.shape[0], y + 4)
        x0, x1 = max(0, x - 3), min(work.shape[1], x + 4)
        work[y0:y1, x0:x1] = -np.inf
    return out


def find_dipoles(sig, thresh: float = 5.0, pair_px: float = 12.0) -> Dict[str, Any]:
    """Pair +peaks with nearby -peaks (mover dipoles); leftovers are variables."""
    import math
    pos = _peaks(sig, thresh, +1)
    neg = _peaks(sig, thresh, -1)
    used_neg = set()
    movers, variables = [], []
    for p in pos:
        best, bestd = None, 1e9
        for k, q in enumerate(neg):
            if k in used_neg:
                continue
            d = math.hypot(p["x"] - q["x"], p["y"] - q["y"])
            if d < bestd:
                best, bestd = k, d
        if best is not None and bestd <= pair_px:
            used_neg.add(best)
            q = neg[best]
            movers.append({"x": (p["x"] + q["x"]) / 2, "y": (p["y"] + q["y"]) / 2,
                           "sigma": (p["sigma"] + q["sigma"]) / 2,
                           "separation_px": bestd, "kind": "mover"})
        else:
            variables.append({**p, "kind": "variable"})
    for k, q in enumerate(neg):
        if k not in used_neg:
            variables.append({**q, "kind": "variable"})
    return {"movers": movers[:100], "variables": variables[:100],
            "n_pos": len(pos), "n_neg": len(neg)}


def measure_field(img_a, img_b_aligned, var_a=None, var_b=None,
                  thresh: float = 5.0) -> Dict[str, Any]:
    """Difference + dipoles + per-candidate aperture photometry on both epochs."""
    sig = significance_map(img_a, img_b_aligned, var_a, var_b)
    found = find_dipoles(sig, thresh)
    cands = []
    for c in found["movers"] + found["variables"]:
        fa = aperture_flux(img_a, c["x"], c["y"])
        fb = aperture_flux(img_b_aligned, c["x"], c["y"])
        cands.append({**c, "flux_a": fa["flux"], "flux_b": fb["flux"],
                      "flux_err_a": fa["flux_err"], "flux_err_b": fb["flux_err"]})
    try:
        import numpy as np
        finite = np.asarray(sig)[np.isfinite(sig)]
        stats = {"sigma_max": float(finite.max()) if finite.size else 0.0,
                 "sigma_min": float(finite.min()) if finite.size else 0.0,
                 "npix_sig5": int(((finite > 5) | (finite < -5)).sum())}
    except Exception:
        stats = {"sigma_max": 0.0, "sigma_min": 0.0, "npix_sig5": 0}
    return {"candidates": cands[:80], **stats, "threshold": thresh}
