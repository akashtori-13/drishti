#!/usr/bin/env python3
"""Multi-survey context cutouts: DSS2 color + 2MASS IR for every showcase.

Same sky, other eyes — powers the "Other surveys" comparison panel.
Fast (CDS hips2fits JPG, no TAP), resumable, offline-safe.

Writes public/compare/{id}_dss.jpg and {id}_2mass.jpg (0.5 deg, 512px).

Usage: python scripts/fetch_compare.py [--only orion-field]
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

SURVEYS = {
    "dss": "CDS/P/DSS2/color",
    "2mass": "CDS/P/2MASS/color",
}


def main() -> bool:
    import json

    import httpx

    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    args = ap.parse_args()

    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    out = ROOT / "spectrahunt-web" / "public" / "compare"
    out.mkdir(parents=True, exist_ok=True)

    files = sorted(pub.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    for path in files:
        doc = json.loads(path.read_text())
        ra, dec = doc["ra"], doc["dec"]
        for key, hips in SURVEYS.items():
            dest = out / f"{doc['id']}_{key}.jpg"
            if dest.exists() and dest.stat().st_size > 5000:
                continue
            url = ("https://alasky.cds.unistra.fr/hips-image-services/hips2fits"
                   f"?hips={hips.replace('/', '%2F')}&ra={ra}&dec={dec}&fov=0.5"
                   "&width=512&height=512&projection=SIN&coordsys=icrs&rotation=0&format=jpg")
            try:
                with httpx.Client(timeout=90) as client:
                    r = client.get(url, headers={"User-Agent": "DRISHTI/2.0"})
                    r.raise_for_status()
                    if len(r.content) < 5000 or not r.content.startswith(b"\xff\xd8"):
                        print(f"[{doc['id']}] {key}: bad payload ({len(r.content)}B)")
                        continue
                    dest.write_bytes(r.content)
                    print(f"[{doc['id']}] wrote {dest.name} ({len(r.content) // 1024}KB)", flush=True)
            except Exception as e:
                print(f"[{doc['id']}] {key} failed: {str(e)[:100]}")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
