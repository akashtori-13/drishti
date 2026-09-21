#!/usr/bin/env python3
"""Real coverage tallies for showcase cells: per-band image counts + survey passes.

Writes spectrahunt-web/public/coverage.json:
{grid:{w,h}, counts, indexed, cells:{'i,j':{epochs,images,bands,span_mjd}}, generated_at, source}
Base tiles stay generated; pinned cells carry real TAP values.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

TARGETS = {
    "3i-atlas": (252.6633, -17.4904),
    "ecliptic-mover": (180.0, 0.0),
    "nep-deep": (270.0, 66.5),
}
BANDS = [f"SPHEREx-D{i}" for i in range(1, 7)]
GRID_W, GRID_H = 72, 36


def cell_of(ra, dec):
    return (min(GRID_W - 1, max(0, int(ra / 360 * GRID_W))),
            min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H))))


def main():
    import pyvo
    svc = pyvo.dal.TAPService("https://irsa.ipac.caltech.edu/TAP")
    cells = {}
    for sid, (ra, dec) in TARGETS.items():
        all_mjd, per_band = [], {}
        for bp in BANDS:
            q = (f"SELECT TOP 2000 p.time_bounds_lower AS mjd FROM spherex.artifact a "
                 f"JOIN spherex.plane p ON a.planeid=p.planeid "
                 f"WHERE 1=CONTAINS(POINT('ICRS',{ra},{dec}),p.poly) "
                 f"AND p.energy_bandpassname='{bp}' ORDER BY mjd")
            try:
                r = svc.search(q)
                ms = sorted(float(x) for x in r["mjd"])
            except Exception as e:
                print(f"[{sid} {bp}] failed: {e}", flush=True)
                ms = []
            per_band[bp] = len(ms)
            all_mjd += ms
        all_mjd.sort()
        passes, cur = [], None
        for m in all_mjd:
            if cur is None or m - cur[-1] > 20:
                if cur: passes.append(cur)
                cur = [m]
            else:
                cur.append(m)
        if cur: passes.append(cur)
        i, j = cell_of(ra, dec)
        cells[f"{i},{j}"] = {
            "showcase": sid, "ra": ra, "dec": dec,
            "images": len(all_mjd),
            "images_capped": any(v >= 2000 for v in per_band.values()),
            "epochs": len(passes),
            "bands": sum(1 for v in per_band.values() if v),
            "span_mjd": [all_mjd[0], all_mjd[-1]] if all_mjd else None,
            "per_band": per_band,
        }
        print(f"[{sid}] cell=({i},{j}) images={len(all_mjd)} epochs={len(passes)} "
              f"bands={cells[f'{i},{j}']['bands']}", flush=True)

    out = {
        "grid": {"w": GRID_W, "h": GRID_H},
        "cells": cells,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "IRSA TAP spherex.artifact x spherex.plane; passes split on >20d gaps",
    }
    dest = ROOT / "spectrahunt-web" / "public" / "coverage.json"
    dest.write_text(json.dumps(out, indent=2))
    print(f"wrote {dest}")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
