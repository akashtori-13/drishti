#!/usr/bin/env python3
"""Classify showcase fields with real measurements.

For every showcase in spectrahunt-web/public/showcases/*.json, runs the
backend pipeline (aligned difference detection + light curve) and writes
spectrahunt-web/public/reports/{id}.json:

  {id, title, ra, dec, measured_at, detail,
   movers, variables, top_sigma, n_epochs, span_days,
   variable_flag, known: null | {name, kind, citation},
   lightcurve: [{mjd, flux}], spectrum: [{band, wavelength_um, flux}]}

Classification rules (conservative, documented):
- known: only hand-verified entries in KNOWN (cited papers), never inferred.
- mover/variable: pipeline dipole significance + aperture flux ratios.
- variable_flag: any epoch-to-epoch flux ratio > 2 at S/N > 3.
- Everything else stays "Unidentified".

Slow (minutes per field: TAP + IBE + Gaia). Bounded per field, resumable
(skips fields with fresh reports unless --force). Offline-safe.

Usage: python scripts/classify_fields.py [--only orion-field] [--force]
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

# Hand-verified only. 3I/ATLAS: SPHEREx-observed interstellar comet
# (Lisse et al. RNAAS 9:242 + 2026 follow-up, obscore in showcase links).
KNOWN = {
    "3i-atlas": {"name": "3I/ATLAS", "kind": "interstellar comet",
                 "citation": "Lisse et al. RNAAS 9:242; SPHEREx obscore_3I_Atlas.vot"},
}

FRESH_SECONDS = 7 * 86400


def classify(sid: str, force: bool = False):
    from backend.cache import init_db
    from backend.config import DATABASE_PATH
    from backend.pipeline import field_report

    pub = ROOT / "spectrahunt-web" / "public"
    doc = json.loads((pub / "showcases" / f"{sid}.json").read_text())
    out_dir = pub / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{sid}.json"
    if dest.exists() and not force:
        try:
            prev = json.loads(dest.read_text())
            age = (datetime.now(timezone.utc)
                   - datetime.fromisoformat(prev.get("measured_at", "2000-01-01+00:00"))).total_seconds()
            if age < FRESH_SECONDS and prev.get("detail") == "ok":
                print(f"[{sid}] fresh report ({age / 3600:.1f}h old), skipping")
                return True
        except Exception:
            pass

    init_db(DATABASE_PATH)
    try:
        rep = field_report(doc["ra"], doc["dec"], doc.get("epochs", [{}])[0].get("band", 3) or 3)
    except Exception as e:  # noqa: BLE001
        rep = {"detail": f"pipeline-error: {e}", "candidates": []}

    cands = rep.get("candidates", [])
    movers = [c for c in cands if c.get("kind") == "mover"]
    variables = [c for c in cands if c.get("kind") == "variable"]
    top_sigma = max([c.get("sigma", 0) for c in cands] + [0])
    lc = rep.get("lightcurve", [])
    from backend.pipeline import flag_variable
    variable_flag = flag_variable(lc)

    mjds = [e.get("mjd") for e in doc.get("epochs", []) if e.get("mjd") is not None]
    report = {
        "id": sid, "title": doc.get("title"), "ra": doc.get("ra"), "dec": doc.get("dec"),
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "detail": rep.get("detail", "ok"),
        "movers": len(movers), "variables": len(variables), "top_sigma": round(float(top_sigma), 1),
        "n_epochs": len(lc), "span_days": round(max(mjds) - min(mjds), 1) if len(mjds) >= 2 else None,
        "variable_flag": variable_flag,
        "known": KNOWN.get(sid),
        "lightcurve": [{"mjd": p.get("mjd"), "flux": p.get("flux")} for p in lc],
        "spectrum": rep.get("spectrum", []),
    }
    dest.write_text(json.dumps(report, indent=2, default=float))
    print(f"[{sid}] movers={len(movers)} variables={len(variables)} "
          f"topσ={report['top_sigma']} var={variable_flag} known={bool(report['known'])}")
    return True


def main() -> bool:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    files = sorted(pub.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    ok = True
    for path in files:
        try:
            ok &= classify(path.stem, force=args.force)
        except Exception as e:  # noqa: BLE001
            print(f"[{path.stem}] FAILED: {e}")
            ok = False
    return ok


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
