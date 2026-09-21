#!/usr/bin/env python3
"""NEP deep stack: median-combine the newest deep-field visits into one deep PNG.

The North Ecliptic Pole gets hundreds of SPHEREx visits per channel. This
fetches up to 12 recent D4 cutouts, aligns them to the first via WCS, median
stacks (outlier-resistant), and appends a "Deep stack (N visits)" epoch to
nep-deep.json. Offline-safe: failures leave the two-epoch showcase untouched.

Usage: python scripts/nep_stack.py [--n 12]
"""
import argparse
import asyncio
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

RA, DEC, BAND, SIZE = 270.0, 66.5, 4, 0.15


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--timeout", type=int, default=60)
    args = ap.parse_args()

    import numpy as np

    from backend.align import align_images
    from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits, render_png
    from backend.epochs import discover_epochs

    hits = [h for h in discover_epochs(RA, DEC, band=BAND, size_deg=SIZE) if h.get("cutout_url")]
    if len(hits) < 3:
        print(f"only {len(hits)} covering images; need >= 3")
        return False
    picks = hits[-args.n :]
    print(f"stacking {len(picks)} newest D{BAND} visits", flush=True)

    frames = []
    for h in picks:
        tmp = Path(tempfile.mkdtemp()) / "c.fits"
        try:
            asyncio.run(fetch_ibe(h["cutout_url"], tmp, timeout=args.timeout))
            parsed = parse_fits(tmp)
            if parsed["image"] is None:
                continue
            masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
            frames.append((masked, parsed.get("wcs")))
            print(f"  got {h.get('mjd')}", flush=True)
        except Exception as e:
            print(f"  skip ({str(e)[:80]})")
        finally:
            try:
                tmp.unlink(missing_ok=True)
                tmp.parent.rmdir()
            except Exception:
                pass
    if len(frames) < 3:
        print(f"only {len(frames)} usable frames; aborting")
        return False

    base, base_wcs = frames[0]
    stack = [np.asarray(base, dtype=float)]
    for img, wcs in frames[1:]:
        try:
            aligned, _ = align_images(base, base_wcs, img, wcs)
            stack.append(np.asarray(aligned, dtype=float))
        except Exception as e:
            print(f"  align failed, skipping ({str(e)[:80]})")
    arr = np.stack(stack)
    deep = np.nanmedian(arr, axis=0)
    print(f"median of {len(stack)} frames", flush=True)

    out_img = ROOT / "spectrahunt-web" / "public" / "cutouts"
    name = "nep-deep_Deep-stack.png"
    if not render_png(deep, out_img / name):
        print("render failed")
        return False

    pub = ROOT / "spectrahunt-web" / "public" / "showcases" / "nep-deep.json"
    doc = json.loads(pub.read_text())
    if not any(e.get("label", "").startswith("Deep stack (") for e in doc["epochs"]):
        mjds = [h.get("mjd") for h in picks if h.get("mjd")]
        doc["epochs"].append({
            "label": f"Deep stack ({len(stack)} visits)",
            "band": BAND, "wavelength_um": 3.12, "ra": RA, "dec": DEC,
            "size_deg": SIZE, "png": f"/cutouts/{name}",
            "mjd": max(mjds) if mjds else None,
            "note": f"Median of {len(stack)} recent D{BAND} visits. Stacked locally; goes deepest.",
        })
        pub.write_text(json.dumps(doc, indent=2))
        print(f"appended deep-stack epoch ({len(stack)} visits)")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
