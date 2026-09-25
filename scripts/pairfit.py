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
P_EVOLVE = 0.0027  # joint-test p-value threshold (~3 sigma)


def _gser(a: float, x: float) -> float:
    """Regularized lower incomplete gamma P(a,x) by series expansion."""
    if x <= 0:
        return 0.0
    ap = a
    total = 1.0 / a
    delta = total
    for _ in range(200):
        ap += 1
        delta *= x / ap
        total += delta
        if abs(delta) < abs(total) * 1e-12:
            break
    return total * math.exp(-x + a * math.log(x) - math.lgamma(a))


def chi2_sf(x: float, k: int) -> float:
    """Survival function P(ChiSq_k > x). Pure stdlib, deterministic."""
    if x <= 0:
        return 1.0
    return max(0.0, min(1.0, 1.0 - _gser(k / 2.0, x / 2.0)))


def joint_shared_colour(epochs: list[tuple[float, float, float, float]]):
    """Joint fit: free amplitude per epoch, ONE shared colour fraction r.

    Model: fa_t = A_t*r, fb_t = A_t*(1-r). Returns (chi2, r_hat).
    Saturated per-epoch model has chi2 == 0, so chi2 ~ ChiSq(T-1) under the
    shared-colour null. Golden-section search on r; A_t analytic (WLS).
    """
    def chi2_of(r: float) -> float:
        r = min(1.0 - 1e-9, max(1e-9, r))
        tot = 0.0
        for fa, sa, fb, sb in epochs:
            wa, wb = 1.0 / max(1e-18, sa * sa), 1.0 / max(1e-18, sb * sb)
            A = (fa * r * wa + fb * (1 - r) * wb) / max(1e-18, r * r * wa + (1 - r) ** 2 * wb)
            tot += (fa - A * r) ** 2 * wa + (fb - A * (1 - r)) ** 2 * wb
        return tot
    lo, hi = 1e-6, 1 - 1e-6
    gr = (math.sqrt(5) - 1) / 2
    c, d = hi - gr * (hi - lo), lo + gr * (hi - lo)
    for _ in range(80):
        if chi2_of(c) < chi2_of(d):
            hi = d
        else:
            lo = c
        c, d = hi - gr * (hi - lo), lo + gr * (hi - lo)
    r_hat = (lo + hi) / 2
    return chi2_of(r_hat), r_hat


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
        used_b: set[int] = set()  # one B epoch pairs at most once (independence)
        for a in by_band.get(ba, []):
            cands = [(j, b) for j, b in enumerate(by_band.get(bb, []))
                     if j not in used_b and abs(b["mjd"] - a["mjd"]) <= DT_TOL_DAYS]
            if not cands:
                continue
            j, b = min(cands, key=lambda jb: abs(jb[1]["mjd"] - a["mjd"]))
            used_b.add(j)
            A, sA, R, sR = pair_stats(a["flux"], a["flux_err"] or 0,
                                      b["flux"], b["flux_err"] or 0)
            # response-aware colour: flux per unit bandwidth in each arm,
            # folding the SPHEREx band response (dlam) into the ratio
            dla = a.get("bandwidth_um") or 0
            dlb = b.get("bandwidth_um") or 0
            if R is not None and dla and dlb and dla > 0 and dlb > 0:
                r_pb = R * (dlb / dla)
                r_pb_err = (sR or 0) * (dlb / dla)
            else:
                r_pb, r_pb_err = None, None
            pairs.append({
                "family": name, "bands": [ba, bb],
                "mjd": round((a["mjd"] + b["mjd"]) / 2, 4),
                "dt_days": round(abs(a["mjd"] - b["mjd"]), 6),
                "A": A, "A_err": sA, "R": R, "R_err": sR,
                "R_per_bandwidth": r_pb, "R_per_bandwidth_err": r_pb_err,
                "core_masked": (True if True in (a.get("core_masked"), b.get("core_masked"))
                                else None if None in (a.get("core_masked"), b.get("core_masked"))
                                else False),
                "la": a.get("wavelength_um"), "lb": b.get("wavelength_um"),
                "fa": a["flux"], "fb": b["flux"],
                "fa_err": a["flux_err"] or 0, "fb_err": b["flux_err"] or 0,
            })
    tests = []
    joints = []
    quality_masked = []
    pre_fix = False
    for name in FAMILIES.values():
        fam = []
        for p in pairs:
            if p["family"] != name or p["R"] is None:
                continue
            cm = p.get("core_masked")
            if cm is True:
                quality_masked.append(
                    {"family": name, "mjd": p["mjd"], "reason": "core pixel masked"})
                continue
            if cm is None:
                pre_fix = True  # predates mask tracking; verdict carries a caveat
            fam.append(p)
        fam.sort(key=lambda p: p["mjd"])
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
        # joint likelihood test: one shared colour across ALL clean epochs
        # of this family vs per-epoch colours (saturated). chi2 ~ ChiSq(T-1).
        joint = None
        if len(fam) >= 2:
            ep = [(p["fa"], max(1e-9, p["fa_err"] or 0),
                   p["fb"], max(1e-9, p["fb_err"] or 0)) for p in fam]
            chi2, r_hat = joint_shared_colour(ep)
            dof = len(ep) - 1
            pv = chi2_sf(chi2, dof)
            joint = {"family": name, "epochs": len(ep),
                     "chi2": round(chi2, 3), "dof": dof,
                     "p_shared_colour": pv,
                     "r_hat": round(r_hat, 4),
                     "joint_verdict": ("colour evolution (shared-R rejected)"
                                       if pv < P_EVOLVE else "consistent-static")}
            print(f"{name} JOINT shared-R: chi2={chi2:.2f}/{dof} p={pv:.4f} "
                  f"=> {joint['joint_verdict']}")
            joints.append(joint)
    tag = Path(path).stem.replace("track_", "")
    out = Path("data") / f"pairfit_{tag}.json"
    out.write_text(json.dumps({"source": Path(path).name, "pairs": pairs,
                               "tests": tests, "joints": joints,
                               "quality_masked": quality_masked,
                               "pre_fix_caveat": pre_fix}, indent=2))
    for t in tests:
        print(f"{t['family']} {t['mjd0']}->{t['mjd1']}: "
              f"dA={t['dA_sigma']}σ dR={t['dR_sigma']}σ => {t['verdict']}")
    masked = sum(1 for p in pairs if p["R"] is None)
    print(f"pairs={len(pairs)} masked-colour={masked} tests={len(tests)} -> {out}")
    return {"pairs": pairs, "tests": tests}


if __name__ == "__main__":
    main(sys.argv[1])
