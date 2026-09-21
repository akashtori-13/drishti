#!/usr/bin/env python3
"""End-to-end field processing: one sky position -> measured report JSON.

Runs the full sophisticated pipeline (discover, align, difference, detect,
photometry, catalogs) and writes a timestamped report:

    python scripts/process_field.py --ra 180 --dec 0 --band 3 [--out reports/]

Offline-safe: every stage degrades; the report always records what worked.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--band", type=int, default=3)
    ap.add_argument("--out", default="data/reports")
    args = ap.parse_args()

    from backend.cache import init_db
    from backend.config import DATABASE_PATH
    from backend.pipeline import field_report

    init_db(DATABASE_PATH)
    t0 = datetime.now(timezone.utc)
    try:
        report = field_report(args.ra, args.dec, args.band)
    except Exception as e:  # noqa: BLE001
        report = {"ra": args.ra, "dec": args.dec, "band": args.band,
                  "detail": f"pipeline-error: {e}", "candidates": []}
    report["processed_at"] = t0.isoformat()
    dest = ROOT / args.out / f"field_{args.ra:.4f}_{args.dec:+.4f}_d{args.band}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, indent=2, default=float))
    n = len(report.get("candidates", []))
    print(f"wrote {dest}: {n} candidates, "
          f"lightcurve={len(report.get('lightcurve', []))}pts, "
          f"spectrum={len(report.get('spectrum', []))}pts, detail={report.get('detail')}")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
