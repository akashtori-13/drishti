#!/usr/bin/env python3
"""Warm a cold device: pre-populate discovery + key products for all showcases.

On a fresh clone the SQLite cache is empty, so the first live request pays
every IRSA round-trip at once. Run this once (or nightly) to front-load the
slow queries with retries, so interactive use stays fast even when IRSA is
flaky. Reads never fail the run; failures just log.

Usage: python scripts/warm_cache.py [--bands] [--detect N]
  --bands: also warm per-band discovery (slower, powers RGB/spectra)
  --detect N: run full detection on the first N showcases (slowest)
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bands", action="store_true")
    ap.add_argument("--detect", type=int, default=0)
    args = ap.parse_args()

    from backend.cache import init_db
    from backend.config import DATABASE_PATH
    from backend.pipeline import detect_field, discover_cached

    init_db(DATABASE_PATH)
    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    docs = [json.loads(f.read_text()) for f in sorted(pub.glob("*.json"))]
    print(f"warming {len(docs)} showcases", flush=True)

    for doc in docs:
        ra, dec = doc["ra"], doc["dec"]
        bands = [3] + ([1, 2, 4, 5, 6] if args.bands else [])
        for b in bands:
            try:
                hits = discover_cached(ra, dec, b, 0.15, DATABASE_PATH)
                print(f"[{doc['id']}] D{b}: {len(hits)} epochs cached", flush=True)
            except Exception as e:  # noqa: BLE001 - warmth is best-effort
                print(f"[{doc['id']}] D{b} failed: {str(e)[:100]}")

    if args.detect > 0:
        for doc in docs[: args.detect]:
            try:
                out = detect_field(doc["ra"], doc["dec"], 3, 0.15, DATABASE_PATH)
                print(f"[{doc['id']}] detect: {out.get('detail')} "
                      f"{len(out.get('candidates', []))} candidates", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"[{doc['id']}] detect failed: {str(e)[:100]}")
    print("warm complete (failures are non-fatal by design)")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
