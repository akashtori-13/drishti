#!/usr/bin/env python3
"""All-sky SPHEREx census via spherex.obscore bounding boxes.

One bounded query per sky box (RA slice x Dec band); bins s_ra/s_dec/t_min
client-side into the 72x36 coverage grid. Incremental + resumable: progress
lives in data/census_progress.json, final tallies go to
spectrahunt-web/public/coverage.json (merged with showcase tags).

Usage: python scripts/sky_census.py [--ra-step 30] [--dec-step 30] [--top 30000]
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

GRID_W, GRID_H = 72, 36
PROGRESS = ROOT / "data" / "census_progress.json"


def cell_of(ra, dec):
    return (min(GRID_W - 1, max(0, int(ra / 360 * GRID_W))),
            min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H))))


def fetch_box(svc, ra0, ra1, dec0, dec1, top, timeout):
    import threading
    box: dict = {}
    q = (
        "SELECT TOP %d s_ra, s_dec, t_min, energy_bandpassname AS bandpass "
        "FROM spherex.obscore "
        "WHERE s_ra BETWEEN %f AND %f AND s_dec BETWEEN %f AND %f"
        % (top, ra0, ra1, dec0, dec1)
    )

    def target():
        try:
            box["rows"] = svc.search(q, maxrec=top)
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    w = threading.Thread(target=target, daemon=True)
    w.start()
    w.join(timeout=timeout)
    if w.is_alive():
        raise TimeoutError(f"box [{ra0},{ra1}]x[{dec0},{dec1}] exceeded {timeout}s")
    if "error" in box:
        raise box["error"]
    return box.get("rows", [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra-step", type=float, default=30.0)
    ap.add_argument("--dec-step", type=float, default=30.0)
    ap.add_argument("--top", type=int, default=30000)
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--publish-only", action="store_true",
                    help="write coverage.json from current progress without querying")
    ap.add_argument("--shard", default=None,
                    help="shard partition I/N, e.g. 0/4 (this worker handles boxes[I::N])")
    ap.add_argument("--progress", default=None,
                    help="progress file for this worker (default: data/census_progress.json)")
    ap.add_argument("--merge", action="store_true",
                    help="merge data/census_shard_*.json into coverage.json without querying")
    ap.add_argument("--seed", default=None,
                    help="extra progress file to seed done/cells from (e.g. main progress)")
    args = ap.parse_args()

    if args.merge:
        merged: dict = {"done": [], "cells": {}}
        # shard files only (they partition all boxes; main progress is superseded).
        # parse-retry: workers rewrite these files; never silently drop a torn read.
        import time as _time
        for src in sorted((ROOT / "data").glob("census_shard_*.json")):
            part = None
            for _ in range(10):
                try:
                    part = json.loads(Path(src).read_text())
                    break
                except Exception:
                    _time.sleep(3)
            if part is None:
                print(f"merge ABORTED: {src} unreadable; keeping published coverage", flush=True)
                return False
            for k in part.get("done", []):
                if k not in merged["done"]:
                    merged["done"].append(k)
            for ck, c in part.get("cells", {}).items():
                m = merged["cells"].setdefault(ck, {"images": 0, "mjds": [], "per_band": {}, "capped": False})
                m["images"] += c.get("images", 0)
                m["mjds"].extend(c.get("mjds", []))
                for bp, v in c.get("per_band", {}).items():
                    m["per_band"][bp] = m["per_band"].get(bp, 0) + v
                if c.get("capped"):
                    m["capped"] = True
        finalize(merged["cells"])
        print(f"merged {len(merged['done'])} boxes", flush=True)
        return True

    if args.publish_only:
        try:
            progress = json.loads(PROGRESS.read_text())
        except Exception:
            print("no progress yet")
            return False
        finalize(progress.get("cells", {}))
        return True

    import pyvo

    from backend.epochs import bandpass_name

    prog_path = Path(args.progress) if args.progress else PROGRESS
    try:
        progress = json.loads(prog_path.read_text())
    except Exception:
        progress = {"done": [], "cells": {}}
    if args.seed:
        try:
            seed = json.loads(Path(args.seed).read_text())
            for k in seed.get("done", []):
                if k not in progress.get("done", []):
                    progress.setdefault("done", []).append(k)
            for ck, c in seed.get("cells", {}).items():
                if ck not in progress.get("cells", {}):
                    progress.setdefault("cells", {})[ck] = c
        except Exception as e:
            print(f"seed failed: {e}", flush=True)
    done = set(progress.get("done", []))
    cells = progress.get("cells", {})

    svc = pyvo.dal.TAPService("https://irsa.ipac.caltech.edu/TAP")
    boxes = []
    ra = 0.0
    while ra < 360.0:
        dec = -90.0
        while dec < 90.0:
            boxes.append((round(ra, 1), round(min(360.0, ra + args.ra_step), 1),
                          round(dec, 1), round(min(90.0, dec + args.dec_step), 1)))
            dec += args.dec_step
        ra += args.ra_step

    if args.shard:
        try:
            si, sn = (int(x) for x in args.shard.split("/"))
            boxes = [b for k, b in enumerate(boxes) if k % sn == si]
            print(f"shard {si}/{sn}: {len(boxes)} boxes", flush=True)
        except Exception as e:
            print(f"bad --shard: {e}", flush=True)
            return False

    for b in boxes:
        key = f"{b[0]}:{b[1]}:{b[2]}:{b[3]}"
        if key in done:
            continue
        try:
            rows = fetch_box(svc, *b, args.top, args.timeout)
        except Exception as e:
            print(f"[box {key}] failed: {e}", flush=True)
            continue
        capped = len(rows) >= args.top
        for r in rows:
            try:
                ra_, dec_, mjd, bp = float(r["s_ra"]), float(r["s_dec"]), r["t_min"], str(r["bandpass"])
            except Exception:
                continue
            i, j = cell_of(ra_, dec_)
            ck = f"{i},{j}"
            c = cells.setdefault(ck, {"images": 0, "mjds": [], "per_band": {}, "capped": False})
            c["images"] += 1
            try:
                c["mjds"].append(float(mjd))
            except (TypeError, ValueError):
                pass
            c["per_band"][bp] = c["per_band"].get(bp, 0) + 1
            if capped:
                c["capped"] = True
        done.add(key)
        progress = {"done": sorted(done), "cells": cells}
        prog_path.parent.mkdir(parents=True, exist_ok=True)
        prog_path.write_text(json.dumps(progress))
        print(f"[box {key}] rows={len(rows)} cells={len(cells)}", flush=True)
    finalize(cells)
    return True

def finalize(cells):
    """Bin client-side tallies into coverage.json (passes split on >20d gaps)."""
    pub_show = ROOT / "spectrahunt-web" / "public" / "showcases"
    showcase_cells = {}
    for f in pub_show.glob("*.json"):
        try:
            doc = json.loads(f.read_text())
            i, j = cell_of(doc["ra"], doc["dec"])
            showcase_cells[f"{i},{j}"] = doc["id"]
        except Exception:
            continue

    out_cells = {}
    for ck, c in cells.items():
        mjds = sorted(m for m in c["mjds"] if m)
        passes, cur = [], None
        for m in mjds:
            if cur is None or m - cur[-1] > 20:
                if cur:
                    passes.append(cur)
                cur = [m]
            else:
                cur.append(m)
        if cur:
            passes.append(cur)
        bands = sum(1 for v in c["per_band"].values() if v)
        # representative coord: showcase coord if tagged else cell center
        i, j = map(int, ck.split(","))
        ra_c = (i + 0.5) / GRID_W * 360
        dec_c = 90 - (j + 0.5) / GRID_H * 180
        sid = showcase_cells.get(ck, "")
        if sid:
            try:
                doc = json.loads((pub_show / f"{sid}.json").read_text())
                ra_c, dec_c = doc["ra"], doc["dec"]
            except Exception:
                pass
        out_cells[ck] = {
            "showcase": sid, "ra": round(ra_c, 4), "dec": round(dec_c, 4),
            "images": c["images"], "images_capped": bool(c.get("capped")),
            "epochs": len(passes), "bands": bands,
            "span_mjd": [mjds[0], mjds[-1]] if mjds else None,
            "per_band": c["per_band"],
        }

    out = {
        "grid": {"w": GRID_W, "h": GRID_H},
        "cells": out_cells,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "IRSA TAP spherex.obscore s_ra/s_dec boxes; passes split on >20d gaps",
    }
    dest = ROOT / "spectrahunt-web" / "public" / "coverage.json"
    dest.write_text(json.dumps(out, indent=2))
    print(f"wrote {dest} with {len(out_cells)} cells", flush=True)
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
