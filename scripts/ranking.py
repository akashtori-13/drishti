#!/usr/bin/env python3
"""Step 7: residual colour-variability ranking across tracks (DISTA).

Reads every data/pairfit_*.json, collects cross-epoch pair tests, and ranks
targets by their strongest colour-evolution signal (max dR), with quality
gates up front: targets with no clean tests (all quality-masked) rank as
UNRATED, never as static. Output: data/ranking.json + printed leaderboard.

No network. Deterministic.
"""
from __future__ import annotations

import glob
import json
from pathlib import Path


def main() -> dict:
    rows = []
    for f in sorted(glob.glob("data/pairfit_*.json")):
        d = json.loads(Path(f).read_text())
        tests = d.get("tests", [])
        masked = len(d.get("quality_masked", []))
        sigs = [(t["dR_sigma"], t["dA_sigma"], t["family"], t["verdict"])
                for t in tests]
        if not sigs:
            rows.append({"target": Path(f).stem.replace("pairfit_", ""),
                         "status": "UNRATED", "reason": "no clean cross-epoch tests",
                         "n_tests": 0, "n_masked": masked,
                         "max_dR": None, "max_dA": None})
            continue
        best = max(sigs, key=lambda s: s[0])
        rows.append({"target": Path(f).stem.replace("pairfit_", ""),
                     "status": "RATED", "n_tests": len(tests), "n_masked": masked,
                     "max_dR": best[0], "max_dA": best[1],
                     "best_family": best[2], "best_verdict": best[3]})
    rated = sorted([r for r in rows if r["status"] == "RATED"],
                   key=lambda r: r["max_dR"], reverse=True)
    unrated = [r for r in rows if r["status"] == "UNRATED"]
    board = {"rated": rated, "unrated": unrated}
    Path("data/ranking.json").write_text(json.dumps(board, indent=2))
    print("=== colour-variability ranking (max cross-epoch dR) ===")
    for i, r in enumerate(rated, 1):
        print(f"{i}. {r['target']}: max dR={r['max_dR']}σ ({r['best_family']}, "
              f"{r['best_verdict']}, {r['n_tests']} tests, {r['n_masked']} masked)")
    for r in unrated:
        print(f"-. {r['target']}: UNRATED ({r['reason']}, {r['n_masked']} masked)")
    print("wrote data/ranking.json")
    return board


if __name__ == "__main__":
    main()
