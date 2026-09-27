"""E0: wavelength-truth gate — one cutout x three lambda methods.

Method A (status quo): band-center fallback from backend.config BANDS.
Method B (under test): WCS-WAVE grid + cutout->detector offset conventions.
Method C (open): standalone CWAVE/CBAND calibration (location TBD).

Writes data/wave_truth_e0.json (small, committed). Never claims more
than the headers support. See docs/DISTA-READINESS.md (tautology note).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent


def load_wave_grid(fits_path):
    """Return (xs, ys, lam[Ny][Nx], dl) or None."""
    from astropy.io import fits
    try:
        d = fits.getdata(str(fits_path), "WCS-WAVE")
    except Exception:
        return None
    row = d[0]
    xs = [int(v) for v in row["X"]]
    ys = [int(v) for v in row["Y"]]
    vals = row["VALUES"]
    lam = [[float(vals[j][i][0]) for i in range(len(xs))] for j in range(len(ys))]
    dl = [[float(vals[j][i][1]) for i in range(len(xs))] for j in range(len(ys))]
    return xs, ys, lam, dl


def interp_grid(xs, ys, grid, px, py):
    """Bilinear interp of grid[j][i] at detector coords (px, py). None if outside."""
    import bisect
    if not (xs[0] <= px <= xs[-1] and ys[0] <= py <= ys[-1]):
        return None
    ix = min(bisect.bisect_right(xs, px) - 1, len(xs) - 2)
    iy = min(bisect.bisect_right(ys, py) - 1, len(ys) - 2)
    fx = (px - xs[ix]) / (xs[ix + 1] - xs[ix]) if xs[ix + 1] != xs[ix] else 0.0
    fy = (py - ys[iy]) / (ys[iy + 1] - ys[iy]) if ys[iy + 1] != ys[iy] else 0.0
    a, b = grid[iy][ix], grid[iy][ix + 1]
    c, d = grid[iy + 1][ix], grid[iy + 1][ix + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def main() -> None:
    from astropy.io import fits
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg is None:
        import glob
        cands = sorted(glob.glob(str(ROOT / "data" / "fits-cache" / "*.fits")))
        if not cands:
            print("no cached FITS; pass a path")
            sys.exit(2)
        arg = cands[0]
    fp = Path(arg)
    hdr = fits.getheader(str(fp), "IMAGE")
    nx, ny = int(hdr.get("NAXIS1", 0)), int(hdr.get("NAXIS2", 0))
    crpix = (float(hdr.get("CRPIX1", float("nan"))), float(hdr.get("CRPIX2", float("nan"))))
    band_id = None
    for key in ("BAND", "FILTER", "BANDPASS"):
        if key in hdr:
            try:
                band_id = int(str(hdr[key]).strip("DBand "))
                break
            except ValueError:
                pass

    out: dict = {"file": fp.name, "naxis": [nx, ny], "crpix": list(crpix), "band_id": band_id}

    # Method A: band-center fallback (current pipeline behavior).
    sys.path.insert(0, str(ROOT))
    try:
        from backend.config import BANDS as _BANDS
        for _b in _BANDS:
            if band_id is not None and int(_b["id"]) == int(band_id):
                out["method_A_band_center"] = {"lam_um": float(_b["wave_um"]), "R": float(_b["R"])}
    except Exception as e:  # noqa: BLE001
        out["method_A_band_center"] = {"error": str(e)[:80]}

    # Method B: WCS-WAVE grid under offset conventions.
    wg = load_wave_grid(fp)
    if wg is None:
        out["method_B_wave_grid"] = {"error": "no WCS-WAVE extension"}
    else:
        xs, ys, lam, dl = wg
        flat = [v for row in lam for v in row]
        out["method_B_wave_grid"] = {
            "grid_nx_ny": [len(xs), len(ys)],
            "grid_lam_min": round(min(flat), 4),
            "grid_lam_max": round(max(flat), 4),
        }
        # Target = cutout center (we don't assume target coords here; E0 is
        # about the mapping, not one star).
        cx, cy = (nx - 1) / 2.0, (ny - 1) / 2.0
        conventions = {
            # parent = cutout - CRPIX (CRPIX read as cutout-frame ref pixel)
            "minus_crpix": (cx - crpix[0], cy - crpix[1]),
            # identity (cutout coords already detector coords)
            "identity": (cx, cy),
        }
        res = {}
        for name, (px, py) in conventions.items():
            res[name] = {
                "parent_xy": [round(px, 2), round(py, 2)],
                "lam_um": (lambda v: round(v, 4) if v is not None else None)(interp_grid(xs, ys, lam, px, py)),
                "in_detector": 0 <= px <= 2040 and 0 <= py <= 2040,
            }
        out["method_B_wave_grid"]["conventions"] = res
        inside = [v for v in (r["lam_um"] for r in res.values()) if v is not None]
        # NOTE: "identity" lands only because the grid spans the detector —
        # nothing justifies cutout origin == detector origin, and minus_crpix
        # falls off-detector. No convention is independently justified.
        out["method_B_wave_grid"]["verdict"] = (
            "UNDECIDED — in-range hits are unjustified (identity assumes "
            "cutout origin == detector origin with no evidence); minus_crpix "
            "falls off-detector. Cutout headers carry no parent offset. "
            "Confirmed fallback posture; needs CWAVE/CBAND or sky-truth."
        )

    out["method_C_cwave_cband"] = {"status": "open", "note": "standalone calibration location TBD (IRSA docs check)"}
    dest = ROOT / "data" / "wave_truth_e0.json"
    dest.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
