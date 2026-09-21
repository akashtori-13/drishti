#!/usr/bin/env python3
"""Per-band cutout indexer: newest visit in each of the 6 detectors per showcase.

Writes public/cutouts/{id}_D{band}.png + a `bands` map into each showcase JSON:
  bands: {1: {png, cutout_url, mjd, wavelength_um}, ...}

Powers the RGB composite and the static spectrum view with REAL pixels.
Band 3 reuses the newest epoch PNG when present (no refetch).

Resumable (skips filled bands), bounded, offline-safe.

Usage: python scripts/build_bandstack.py [--only orion-field]
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

BAND_WAVES = {1: 0.92, 2: 1.36, 3: 2.02, 4: 3.12, 5: 4.12, 6: 4.71}


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--size", type=float, default=0.15)
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits, render_png
    from backend.epochs import bandpass_name, discover_epochs

    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    out_img = ROOT / "spectrahunt-web" / "public" / "cutouts"
    out_img.mkdir(parents=True, exist_ok=True)

    files = sorted(pub.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    for path in files:
        doc = json.loads(path.read_text())
        bands = doc.setdefault("bands", {})
        changed = False
        for det in range(1, 7):
            key = str(det)
            if bands.get(key, {}).get("png"):
                continue
            if det == 3:
                # reuse newest epoch PNG when the epochs are same-band D3
                eps = [e for e in doc.get("epochs", []) if e.get("band") == 3 and e.get("png")]
                if eps:
                    newest = max(eps, key=lambda e: e.get("mjd") or 0)
                    bands[key] = {"png": newest["png"], "cutout_url": newest.get("cutout_url"),
                                  "mjd": newest.get("mjd"), "wavelength_um": newest.get("wavelength_um", 2.02)}
                    changed = True
                    print(f"[{doc['id']}] D3 reused {newest['png']}", flush=True)
                    continue
            ra, dec = doc["ra"], doc["dec"]
            print(f"[{doc['id']}] D{det} ({bandpass_name(det)}) TAP+IBE…", flush=True)
            try:
                hits = [h for h in discover_epochs(ra, dec, band=det, size_deg=args.size)
                        if h.get("cutout_url")]
                if not hits:
                    print(f"[{doc['id']}] D{det}: no covering image")
                    continue
                done = False
                for h in hits[-5:][::-1]:  # newest first, sibling fallback (IBE 422s)
                    url = h["cutout_url"]
                    tmp = out_img / f"_{doc['id']}_D{det}_tmp.fits"
                    try:
                        asyncio.run(fetch_ibe(url, tmp, timeout=args.timeout))
                    except Exception as e:
                        print(f"[{doc['id']}] D{det} IBE failed, next frame: {str(e)[:80]}")
                        continue
                    try:
                        parsed = parse_fits(tmp)
                        if parsed["image"] is None:
                            continue
                        masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"),
                                                    parsed.get("variance"))
                        name = f"{doc['id']}_D{det}.png"
                        if render_png(masked, out_img / name):
                            bands[key] = {"png": f"/cutouts/{name}", "cutout_url": url,
                                          "mjd": h.get("mjd"),
                                          "wavelength_um": parsed.get("wavelength_um") or BAND_WAVES[det]}
                            changed = True
                            print(f"[{doc['id']}] wrote {name}")
                            done = True
                            break
                    finally:
                        try:
                            tmp.unlink(missing_ok=True)
                        except Exception:
                            pass
                if not done:
                    print(f"[{doc['id']}] D{det}: all frames failed")
            except Exception as e:
                print(f"[{doc['id']}] D{det} failed: {e}")
        if changed:
            path.write_text(json.dumps(doc, indent=2))
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
