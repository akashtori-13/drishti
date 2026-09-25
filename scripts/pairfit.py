#!/usr/bin/env python3
"""Same-time 2-band joint constraint (DISTA pair-colour approach).

SPHEREx exposes detector pairs simultaneously (D1+D4, D2+D5, D3+D6); the
track JSONs confirm it: paired bands share MJDs to ~1e-3 d from the same
weekly processing directory. This script exploits that instead of treating
every wavelength independently.

Per simultaneous pair it reparameterizes the two fluxes into:
  amplitude A = fa + fb  (overall brightness, shape-preserving changes)
  colour    R = fa / fb  (relative spectral shape at that instant)
with full error propagation. With 2 measurements and 2 parameters this is
an exact reparameterization, not a fit — the statistical content is the
CROSS-EPOCH comparison per pair family: is a change achromatic (A moves,
R constant), colour evolution (R moves), or static (neither)?

Non-simultaneous bands are reported as time-confounded by construction:
their R spans different physical instants and gets no evolution verdict.

Usage:
    .venv/bin/python scripts/pairfit.py data/track_3i-atlas-tracked.json
    .venv/bin/python scripts/pairfit.py data/track_252.65242_-17.50776.json

No network. Deterministic. Writes data/pairfit_<tag>.json.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

FAMILIES = {(1, 4): "D1+D4", (2, 5): "D2+D5", (3, 6): "D3+D6"}
DT_TOL_DAYS = 0.01  # simultaneous = within ~15 min; ours are ~2 min apart
SIG = 3.0  # evolution verdict threshold


def pair_stats(fa: float, sa: float, fb: float, sb: float):
    """(A, sigma_A, R, sigma_R); None when colour is undefined (fa/fb <= 0)."""
    a = fa + fb
    sa_ = math.hypot(sa, sb)
    if fa <= 0 or fb <= 0:
        return a, sa_, None, None
    r = fa / fb
    sr = r * math.hypot(sa / fa, sb / fb)
    return a, sa_, r, sr


def main(path: str) -> dict:
    doc = json.loads(Path(path).read_text())
    pts = [p for p in doc["points"]
           if p.get("flux") is not None and p.get("mjd") is not None]
    by_band: dict[int, list] = {}
    for p in pts:
        by_band.setdefault(int(p["band"]), []).append(p)
    pairs = []
    for (ba, bb), name in FAMILIES.items():
        for a in by_band.get(ba, []):
            cands = [b for b in by_band.get(bb, [])
                     if abs(b["mjd"] - a["mjd"]) <= DT_TOL_DAYS]
            if not cands:
                continue
            b = min(cands, key=lambda q: abs(q["mjd"] - a["mjd"]))
            A, sA, R, sR = pair_stats(a["flux"], a["flux_err"] or 0,
                                      b["flux"], b["flux_err"] or 0)
            pairs.append({
                "family": name, "bands": [ba, bb],
                "mjd": round((a["mjd"] + b["mjd"]) / 2, 4),
                "dt_days": round(abs(a["mjd"] - b["mjd"]), 6),
                "A": A, "A_err": sA, "R": R, "R_err": sR,
                "la": a.get("wavelength_um"), "lb": b.get("wavelength_um"),
                "fa": a["flux"], "fb": b["flux"],
            })
    tests = []
    for name in FAMILIES.values():
        fam = sorted(
            [p for p in pairs if p["family"] == name and p["R"] is not None],
            key=lambda p: p["mjd"])
        for p, q in zip(fam, fam[1:]):
            dA = abs(p["A"] - q["A"]) / math.hypot(p["A_err"], q["A_err"])
            dR = abs(p["R"] - q["R"]) / math.hypot(p["R_err"] or 0, q["R_err"] or 0)
            if dR >= SIG and dA >= SIG:
                verdict = "brightness+colour evolution"
            elif dR >= SIG:
                verdict = "colour evolution"
            elif dA >= SIG:
                verdict = "achromatic brightness change"
            else:
                verdict = "consistent-static"
            tests.append({"family": name, "mjd0": p["mjd"], "mjd1": q["mjd"],
                          "dA_sigma": round(dA, 2), "dR_sigma": round(dR, 2),
                          "verdict": verdict})
    tag = Path(path).stem.replace("track_", "")
    out = Path("data") / f"pairfit_{tag}.json"
    out.write_text(json.dumps({"source": Path(path).name, "pairs": pairs,
                               "tests": tests}, indent=2))
    for t in tests:
        print(f"{t['family']} {t['mjd0']}->{t['mjd1']}: "
              f"dA={t['dA_sigma']}σ dR={t['dR_sigma']}σ => {t['verdict']}")
    masked = sum(1 for p in pairs if p["R"] is None)
    print(f"pairs={len(pairs)} masked-colour={masked} tests={len(tests)} -> {out}")
    return {"pairs": pairs, "tests": tests}


if __name__ == "__main__":
    main(sys.argv[1])
