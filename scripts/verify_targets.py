#!/usr/bin/env python3
"""Bulk verify popular-sky targets + QR3 coverage (overnight batch).

1. SIMBAD TAP cone per target (30"): records resolved name + separation.
   Flags targets with no match or >60" offset for review (does not delete).
2. IRSA TAP per target: distinct QR3 bandpasses covering the position.
Outputs: data/targets_verified.json, data/qr3_coverage.json (atomic writes).
Usage: .venv/bin/python scripts/verify_targets.py [--limit N] [--skip-simbad]
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
QUERY_TIMEOUT = 90
CHECKPOINT_EVERY = 50


def load_targets(limit: int | None) -> list[dict]:
    out = []
    for line in (ROOT / "data" / "popular_targets.txt").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.count("|") < 3:
            continue
        name, ra, dec, typ = [x.strip() for x in line.split("|", 3)]
        try:
            out.append({"name": name, "ra": float(ra), "dec": float(dec), "type": typ})
        except ValueError:
            print(f"  SKIP unparsable: {line[:60]}", flush=True)
    return out[:limit] if limit else out


def simbad_check(targets: list[dict]) -> dict:
    import pyvo
    svc = pyvo.dal.TAPService("https://simbad.cds.unistra.fr/simbad/sim-tap")
    ckpt = ROOT / "data" / "targets_verified.partial.json"
    res: dict = {}
    if ckpt.is_file():
        try:
            res = json.loads(ckpt.read_text()).get("results", {})
            print(f"  resuming simbad with {len(res)} done", flush=True)
        except Exception:
            pass
    for i, t in enumerate(targets):
        if t["name"] in res:
            continue
        try:
            q = ("SELECT TOP 1 main_id, ra, dec, DISTANCE(POINT('ICRS', %f, %f), coord) AS sep "
                 "FROM basic WHERE CONTAINS(POINT('ICRS', %f, %f), CIRCLE('ICRS', %f, %f, 0.008333)) = 1 "
                 "ORDER BY sep ASC" % (t["ra"], t["dec"], t["ra"], t["dec"], t["ra"], t["dec"]))
            rows = timed_search(svc, q, 1)
            if len(rows):
                res[t["name"]] = {"match": str(rows[0]["main_id"]),
                                  "sep_arcsec": round(float(rows[0]["sep"]) * 3600.0, 1)}
            else:
                res[t["name"]] = {"match": None, "sep_arcsec": None}
        except Exception as e:  # noqa: BLE001 - record, don't stop the batch
            res[t["name"]] = {"match": "ERROR", "sep_arcsec": None,
                              "error": f"{type(e).__name__}"[:60]}
        if (i + 1) % 100 == 0:
            print(f"  simbad {i + 1}/{len(targets)}", flush=True)
        if len(res) % CHECKPOINT_EVERY == 0:
            checkpoint(ckpt, {"n": len(targets), "results": res})
        time.sleep(0.3)  # be polite
    if ckpt.is_file():
        ckpt.unlink()
    return res


def qr3_coverage(targets: list[dict]) -> dict:
    import pyvo
    svc = pyvo.dal.TAPService("https://irsa.ipac.caltech.edu/TAP")
    ckpt = ROOT / "data" / "qr3_coverage.partial.json"
    res: dict = {}
    if ckpt.is_file():
        try:
            res = json.loads(ckpt.read_text()).get("results", {})
            print(f"  resuming qr3 with {len(res)} done", flush=True)
        except Exception:
            pass
    for i, t in enumerate(targets):
        if t["name"] in res:
            continue
        try:
            q = ("SELECT DISTINCT p.energy_bandpassname AS bp "
                 "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
                 "JOIN spherex.observation o ON p.obsid = o.obsid "
                 "WHERE 1 = CONTAINS(POINT('ICRS', %f, %f), p.poly) "
                 "AND o.collection = 'spherex_qr3'" % (t["ra"], t["dec"]))
            rows = timed_search(svc, q, 10)
            res[t["name"]] = sorted({str(r["bp"]) for r in rows})
        except Exception as e:  # noqa: BLE001
            res[t["name"]] = {"error": f"{type(e).__name__}"[:60]}
        if (i + 1) % 50 == 0:
            print(f"  qr3 {i + 1}/{len(targets)}", flush=True)
        if len(res) % CHECKPOINT_EVERY == 0:
            checkpoint(ckpt, {"n": len(targets), "results": res})
    if ckpt.is_file():
        ckpt.unlink()
    return res


def timed_search(svc, query, maxrec=10):
    """svc.search with a hard timeout (hung TAP calls sleep forever otherwise)."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(svc.search, query, maxrec)
        try:
            return fut.result(timeout=QUERY_TIMEOUT)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f"TAP query exceeded {QUERY_TIMEOUT}s")


def checkpoint(path: Path, obj: dict) -> None:
    atomic_write(path, obj)


def atomic_write(path: Path, obj: dict) -> None:
    import os
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(obj, f, indent=1)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        raise


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--skip-simbad", action="store_true")
    args = ap.parse_args()
    targets = load_targets(args.limit)
    print(f"{len(targets)} targets", flush=True)
    if not args.skip_simbad:
        print("SIMBAD verification...", flush=True)
        atomic_write(ROOT / "data" / "targets_verified.json",
                     {"n": len(targets), "results": simbad_check(targets)})
        print("wrote targets_verified.json", flush=True)
    print("QR3 coverage...", flush=True)
    atomic_write(ROOT / "data" / "qr3_coverage.json",
                 {"n": len(targets), "results": qr3_coverage(targets)})
    print("wrote qr3_coverage.json", flush=True)


if __name__ == "__main__":
    main()
