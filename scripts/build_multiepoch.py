#!/usr/bin/env python3
"""Multi-epoch filler: grow every same-spot showcase up to 6 epochs.

TAP often finds 3-5+ covering visits per field, but showcases ship only
oldest+newest. This samples up to MAX_EPOCHS evenly across the span, skips
visits already represented (same MJD ±1d or same IBE frame), fetches the rest,
and inserts them date-sorted. Resumable, bounded, offline-safe.

Skips 3i-atlas (epochs track a moving comet, not one sky position).

Usage: python scripts/build_multiepoch.py [--only orion-field] [--max 6]
"""
import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

MJD_EPOCH = datetime(1858, 11, 17)
SKIP_IDS = {"3i-atlas"}


def mjd_date(mjd: float) -> str:
    return (MJD_EPOCH + timedelta(days=float(mjd))).strftime("%Y-%m-%d")


def frame_key(url: str) -> str:
    return url.split("ibe/data/")[-1].split(".fits")[0] if "ibe/data/" in url else url


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--max", type=int, default=6)
    ap.add_argument("--size", type=float, default=0.15)
    ap.add_argument("--timeout", type=int, default=120)
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
        if doc["id"] in SKIP_IDS:
            print(f"[{doc['id']}] skipped (moving-target showcase)")
            continue
        band = doc.get("epochs", [{}])[0].get("band", 3)
        size = min(doc.get("epochs", [{}])[0].get("size_deg", args.size), args.size)
        if len(doc.get("epochs", [])) >= args.max:
            print(f"[{doc['id']}] already {len(doc['epochs'])} epochs")
            continue
        print(f"[{doc['id']}] discovering (band {band})…", flush=True)
        try:
            hits = [h for h in discover_epochs(doc["ra"], doc["dec"], band=band, size_deg=size)
                    if h.get("cutout_url") and h.get("mjd")]
        except Exception as e:
            print(f"[{doc['id']}] discovery failed: {e}")
            continue
        if len(hits) <= len(doc["epochs"]):
            print(f"[{doc['id']}] only {len(hits)} visits; nothing to add")
            continue
        # even sample across the span
        k = min(args.max, len(hits))
        picks = [hits[round(i * (len(hits) - 1) / (k - 1))] for i in range(k)]
        known_mjds = [e.get("mjd") for e in doc["epochs"] if e.get("mjd") is not None]
        known_keys = {frame_key(e.get("cutout_url", "")) for e in doc["epochs"] if e.get("cutout_url")}
        changed = False
        for h in picks:
            if any(abs(h["mjd"] - m) < 1.0 for m in known_mjds):
                continue
            if frame_key(h["cutout_url"]) in known_keys:
                continue
            label = f"{mjd_date(h['mjd'])} · D{band}"
            print(f"[{doc['id']}] {label} TAP+IBE…", flush=True)
            added = False
            for url in [h["cutout_url"]]:
                tmp = out_img / f"_{doc['id']}_tmp.fits"
                try:
                    asyncio.run(fetch_ibe(url, tmp, timeout=args.timeout))
                except Exception as e:
                    print(f"[{doc['id']}] IBE failed: {str(e)[:80]}")
                    break
                try:
                    parsed = parse_fits(tmp)
                    if parsed["image"] is None:
                        break
                    masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"),
                                                parsed.get("variance"))
                    png_path = out_img / cutout_png_name(doc["id"], label)
                    if render_png(masked, png_path):
                        doc["epochs"].append({
                            "label": label, "band": band,
                            "wavelength_um": parsed.get("wavelength_um"),
                            "mjd": h["mjd"], "ra": doc["ra"], "dec": doc["dec"],
                            "size_deg": size, "png": f"/cutouts/{png_path.name}",
                            "cutout_url": url,
                        })
                        changed = True
                        added = True
                        print(f"[{doc['id']}] wrote {png_path.name}")
                        break
                finally:
                    try:
                        tmp.unlink(missing_ok=True)
                    except Exception:
                        pass
            if not added:
                print(f"[{doc['id']}] {label}: frame unusable, skipped")
            if len(doc["epochs"]) >= args.max:
                break
        if changed:
            doc["epochs"].sort(key=lambda e: (e.get("mjd") is None, e.get("mjd") or 0))
            path.write_text(json.dumps(doc, indent=2))
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
