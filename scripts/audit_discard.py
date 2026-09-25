#!/usr/bin/env python3
"""Same-band discard audit (DISTA Experiment 2 groundwork).

For every bundled showcase field, considers all epoch pairs with known
band/λ and applies the repo's own blink gate (cutouts.wavelengths_match):
|Δλ| < factor × mean bandwidth. Reports kept vs rejected pairs per field.

Usage: .venv/bin/python scripts/audit_discard.py [--out docs/discard-audit.json]
No network. Deterministic.
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from backend.config import BANDS  # noqa: E402
from backend.cutouts import wavelengths_match  # noqa: E402

WEB = ROOT / "spectrahunt-web"
BAND = {b["id"]: b for b in BANDS}


def bw(band_id: int) -> float:
    b = BAND[int(band_id)]
    return float(b["wave_um"]) / float(b["R"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/discard-audit.json")
    args = ap.parse_args()
    fields = []
    tot_kept = tot_rej = tot_unknown = 0
    for f in sorted((WEB / "public" / "showcases").glob("*.json")):
        d = json.loads(f.read_text())
        eps = [e for e in d.get("epochs", []) if e.get("band")]
        pairs = list(itertools.combinations(eps, 2))
        kept = rej = unknown = 0
        rej_bands: set = set()
        for a, b in pairs:
            try:
                ba, bb = int(a["band"]), int(b["band"])
                la = float(a.get("wavelength_um") or BAND[ba]["wave_um"])
                lb = float(b.get("wavelength_um") or BAND[bb]["wave_um"])
            except (TypeError, ValueError, KeyError):
                unknown += 1
                continue
            if wavelengths_match(la, bw(ba), lb, bw(bb)):
                kept += 1
            else:
                rej += 1
                rej_bands.add(f"{min(ba, bb)}v{max(ba, bb)}")
        tot_kept += kept
        tot_rej += rej
        tot_unknown += unknown
        fields.append({"id": d.get("id"), "epochs": len(eps), "pairs": len(pairs),
                       "kept": kept, "rejected": rej, "unknown": unknown,
                       "rejected_bands": sorted(rej_bands)})
        print(f"{d.get('id'):<18} epochs={len(eps):>2} pairs={len(pairs):>3} "
              f"kept={kept:>3} rejected={rej:>3} unknown={unknown:>3} {sorted(rej_bands)}")
    doc = {"kept": tot_kept, "rejected": tot_rej, "unknown": tot_unknown,
           "rule": "|dλ| < factor × mean bandwidth (cutouts.wavelengths_match)",
           "fields": fields}
    out = ROOT / args.out
    out.write_text(json.dumps(doc, indent=2))
    n = tot_kept + tot_rej
    print(f"\nTOTAL pairs={n} kept={tot_kept} rejected={tot_rej} unknown={tot_unknown}")
    if n:
        print(f"discard fraction: {tot_rej / n:.1%}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
