#!/usr/bin/env python3
"""
Showcase indexer: TAP discovery -> IBE cutout -> PNG.

For each epoch with png=null in spectrahunt-web/public/showcases/*.json,
discovers the newest covering image via IRSA TAP (same bandpass), fetches a
small IBE cutout, masks bad pixels, renders a zscale PNG to
spectrahunt-web/public/cutouts/.

Offline-safe: failures leave png=null (the UI renders story + Aladin context).
Never runs on the CDN. Usage: python scripts/build_showcases.py [--only 3i-atlas]
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--size", type=float, default=0.05,
                    help="Cutout size in deg (0.05 = 3 arcmin, fast)")
    ap.add_argument("--timeout", type=int, default=60,
                    help="Per-epoch network budget in seconds")
    ap.add_argument("--limit", type=int, default=25,
                    help="TAP row cap per discovery query (small = fast on deep fields)")
    args = ap.parse_args()

    from backend.cutouts import cutout_png_name, fetch_ibe, mask_bad_pixels, parse_fits, render_png
    from backend.epochs import bandpass_name, discover_epochs

    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    out_img = ROOT / "spectrahunt-web" / "public" / "cutouts"
    out_img.mkdir(parents=True, exist_ok=True)

    files = sorted(pub.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    for path in files:
        doc = json.loads(path.read_text())
        changed = False
        for idx, ep in enumerate(doc.get("epochs", [])):
            if ep.get("png"):
                continue
            ra = ep.get("ra", doc["ra"])
            dec = ep.get("dec", doc["dec"])
            band = ep.get("band", 3)
            size = min(ep.get("size_deg", args.size), args.size)
            label = ep.get("label", "epoch")
            print(f"[{doc['id']}] {label} TAP+IBE…", flush=True)
            try:
                if idx == 0:
                    hits = discover_epochs(ra, dec, band=band, size_deg=size,
                                           limit=args.limit)
                else:
                    hits = discover_epochs(ra, dec, band=band, size_deg=size,
                                           limit=5, newest=True)
                hits = [h for h in hits if h.get("cutout_url")]
                if not hits:
                    print(f"[{doc['id']}] no covering image ({bandpass_name(band)})")
                    continue
                # First epoch takes the oldest visit, later epochs the newest,
                # so same-coordinate pairs blink two different visits.
                # Try several candidates: some covering frames 422 on IBE
                # ("Arrays do not overlap") despite matching TAP footprints.
                cands = (hits[:5] if idx == 0 else hits[-5:][::-1])
                png_path = out_img / cutout_png_name(doc["id"], label)
                for url in [h["cutout_url"] for h in cands]:
                    tmp = out_img / f"_{doc['id']}_tmp.fits"
                    try:
                        asyncio.run(fetch_ibe(url, tmp, timeout=args.timeout))
                    except Exception as e:
                        print(f"[{doc['id']}] IBE failed, trying next frame: {str(e)[:100]}")
                        continue
                    try:
                        parsed = parse_fits(tmp)
                        if parsed["image"] is None:
                            print(f"[{doc['id']}] empty IMAGE extension, trying next frame")
                            continue
                        masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"),
                                                    parsed.get("variance"))
                        if render_png(masked, png_path):
                            ep["png"] = f"/cutouts/{png_path.name}"
                            ep["cutout_url"] = url
                            changed = True
                            print(f"[{doc['id']}] wrote {png_path.name}")
                            break
                    finally:
                        try:
                            tmp.unlink(missing_ok=True)
                        except Exception:
                            pass
            except Exception as e:
                print(f"[{doc['id']}] {label} failed: {e}")
        if changed:
            path.write_text(json.dumps(doc, indent=2))
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
