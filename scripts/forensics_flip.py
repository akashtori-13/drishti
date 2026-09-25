#!/usr/bin/env python3
"""Forensics on the D1+D4 control-star colour flip (DISTA systematics hunt).

Two visits ~2 min apart gave B1 95.8->49.8 and B4 54.7->101.2 with constant
amplitude. Downloads the four FITS cutouts and reports, per file, everything
that could explain it: aperture/annulus placement vs cutout edge, background
level and gradient, peak pixel (saturation check), masked-flag fraction,
WCS sky position of the aperture, and a rendered PNG with aperture overlay.

Usage: .venv/bin/python scripts/forensics_flip.py
Outputs: data/forensics/flip.json, data/forensics/*.png (never overwrites tracks).
"""
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits, render_png  # noqa: E402

OUT = ROOT / "data" / "forensics"
RA, DEC = 252.65242, -17.50776  # UCAC4 363-079561
R_APER, R_IN, R_OUT = 3.0, 6.0, 10.0


def diagnose(parsed: dict) -> dict:
    import numpy as np
    img = np.asarray(parsed["image"], dtype=float)
    h, w = img.shape[:2]
    x, y = parsed["wcs"].all_world2pix([[RA, DEC]], 0)[0]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.hypot(xx - x, yy - y)
    ap = (dist <= R_APER) & np.isfinite(img)
    an = (dist > R_IN) & (dist <= R_OUT) & np.isfinite(img)
    an_vals = img[an]
    ap_vals = img[ap]
    flags = parsed.get("flags")
    flagfrac = None
    if flags is not None:
        try:
            from backend.cutouts import FLAGS_BAD_MASK
            f = np.asarray(flags)
            flagfrac = float(((f[ap] & FLAGS_BAD_MASK) != 0).sum() / max(1, ap.sum()))
        except Exception:
            flagfrac = None
    try:
        sky = parsed["wcs"].all_pix2world([[float(x), float(y)]], 0)[0]
    except Exception:
        sky = (None, None)
    edge = min(float(x), float(y), w - 1 - float(x), h - 1 - float(y))
    return {
        "cut_pix": [round(float(x), 2), round(float(y), 2)],
        "cut_size": [w, h],
        "edge_dist_px": round(edge, 2),
        "aperture_sky": [round(float(sky[0]), 5) if sky[0] else None,
                         round(float(sky[1]), 5) if sky[1] else None],
        "aper_sum_raw": round(float(np.nansum(ap_vals)), 2),
        "aper_peak": round(float(np.nanmax(ap_vals)), 2),
        "aper_npix": int(ap.sum()),
        "ann_median": round(float(np.median(an_vals)), 3),
        "ann_std": round(float(np.std(an_vals)), 3),
        "ann_npix": int(an.sum()),
        "flagged_frac_aper": flagfrac,
        "wave_um": parsed.get("wavelength_um"),
    }


def overlay(src_png: Path, dst_png: Path, cx: float, cy: float) -> None:
    from PIL import Image, ImageDraw
    im = Image.open(src_png).convert("RGB")
    W, H = im.size
    sx, sy = W / 29.0, H / 29.0  # cutouts are 29x29
    d = ImageDraw.Draw(im)
    for r, col in ((R_APER, "lime"), (R_IN, "yellow"), (R_OUT, "red")):
        d.ellipse([ (cx - r) * sx, (cy - r) * sy,
                    (cx + r) * sx, (cy + r) * sy ], outline=col, width=2)
    im.save(dst_png)


async def main() -> None:
    track = json.loads((ROOT / "data" / "track_252.65242_-17.50776.json").read_text())
    want = [p for p in track["points"]
            if p["band"] in (1, 4) and abs(p["mjd"] - 60903.414) < 0.01
            and p["flux"] is not None]
    assert len(want) == 4, f"expected 4 flip points, got {len(want)}"
    OUT.mkdir(parents=True, exist_ok=True)
    recs = []
    with tempfile.TemporaryDirectory() as td:
        for p in sorted(want, key=lambda q: (q["band"], q["mjd"])):
            dest = Path(td) / f"b{p['band']}_{p['mjd']:.6f}.fits"
            print(f"fetch B{p['band']} mjd={p['mjd']} ...", flush=True)
            await fetch_ibe(p["url"], dest)
            parsed = parse_fits(dest)
            diag = diagnose(parsed)
            keep = OUT / f"flip_b{p['band']}_{p['mjd']:.6f}.fits"
            import shutil
            shutil.move(str(dest), str(keep))
            raw_png = OUT / f"flip_b{p['band']}_{p['mjd']:.6f}.png"
            render_png(parsed["image"], raw_png)
            overlay(raw_png,
                    OUT / f"flip_b{p['band']}_{p['mjd']:.6f}_overlay.png",
                    diag["cut_pix"][0], diag["cut_pix"][1])
            rec = {"band": p["band"], "mjd": p["mjd"], "flux": p["flux"],
                   "flux_err": p["flux_err"], **diag}
            recs.append(rec)
            print(f"  B{p['band']} mjd={p['mjd']:.4f} pix={diag['cut_pix']} "
                  f"edge={diag['edge_dist_px']} bg={diag['ann_median']}±{diag['ann_std']} "
                  f"peak={diag['aper_peak']} flagfrac={diag['flagged_frac_aper']}", flush=True)
    (OUT / "flip.json").write_text(json.dumps(recs, indent=2))
    print(f"wrote {OUT / 'flip.json'}")


if __name__ == "__main__":
    asyncio.run(main())
