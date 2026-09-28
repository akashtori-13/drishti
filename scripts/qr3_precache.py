"""QR3 precache: newest 2 cutouts per covered band per covered target.

Queue source: data/qr3_coverage.json (414 covered targets, bandpass names).
Downloads via backend.cutouts.fetch_ibe (auto-persists to data/fits-cache/,
skips URLs already cached). TAP scoped to collection='spherex_qr3'.
Checkpoints to data/qr3_precache.partial.json every 25 files; resume-safe.
Politeness: 4 concurrent downloads, 60s TAP bound, retries with backoff.

~3,650 files x ~4MB ~= ~15GB. Run overnight.
"""
import argparse
import asyncio
import json
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from backend.cutouts import fetch_ibe  # noqa: E402
from backend.epochs import TAP_URL  # noqa: E402

PARTIAL = ROOT / "data" / "qr3_precache.partial.json"
PER_BAND = 2
CONCURRENCY = 4
SIZE_DEG = 0.05


def load_targets(limit=None):
    cov = json.loads((ROOT / "data" / "qr3_coverage.json").read_text())["results"]
    pop = {}
    for line in (ROOT / "data" / "popular_targets.txt").read_text().splitlines():
        parts = [x.strip() for x in line.split("|", 3)]
        if len(parts) == 4:
            try:
                pop[parts[0]] = (float(parts[1]), float(parts[2]))
            except ValueError:
                pass
    out = []
    for name, bps in cov.items():
        if not isinstance(bps, list) or not bps or name not in pop:
            continue
        ra, dec = pop[name]
        out.append({"name": name, "ra": ra, "dec": dec, "bps": sorted(set(bps))})
    out.sort(key=lambda t: t["name"])
    return out[:limit] if limit else out


def tap_qr3_newest(ra, dec, bandpass, limit=PER_BAND, timeout=60):
    """Newest QR3 artifact cutout URLs for one target x bandpass."""
    import pyvo
    svc = pyvo.dal.TAPService(TAP_URL)
    q = (
        "SELECT TOP %d 'https://irsa.ipac.caltech.edu/' || a.uri AS base_uri, "
        "p.time_bounds_lower AS mjd "
        "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
        "JOIN spherex.observation o ON p.obsid = o.obsid "
        "WHERE 1 = CONTAINS(POINT('ICRS', %f, %f), p.poly) "
        "AND p.energy_bandpassname = '%s' AND o.collection = 'spherex_qr3' "
        "ORDER BY p.time_bounds_lower DESC" % (int(limit), float(ra), float(dec), bandpass)
    )
    box = {}

    def target():
        try:
            box["rows"] = svc.search(q, maxrec=int(limit))
        except Exception as e:  # noqa: BLE001
            box["error"] = e

    last = None
    for _ in range(2):
        box.clear()
        worker = threading.Thread(target=target, daemon=True)
        worker.start()
        worker.join(timeout=timeout)
        if worker.is_alive():
            last = TimeoutError(f"TAP exceeded {timeout}s")
            continue
        if "error" in box:
            last = box["error"]
            continue
        last = None
        break
    if last is not None:
        raise last
    out = []
    for row in box.get("rows", []):
        try:
            out.append({
                "cutout_url": f"{row['base_uri']}?center={ra},{dec}&size={SIZE_DEG}",
                "mjd": float(row["mjd"]),
            })
        except Exception:
            pass
    return out


def load_partial():
    if PARTIAL.is_file():
        try:
            d = json.loads(PARTIAL.read_text())
            print(f"  resuming with {len(d.get('done', {}))} urls done", flush=True)
            return d.get("done", {})
        except Exception:
            pass
    return {}


def save_partial(done):
    PARTIAL.write_text(json.dumps({"done": done}))
    try:
        import os
        fd, tmp = __import__("tempfile").mkstemp(dir=str(ROOT / "data"))
        with os.fdopen(fd, "w") as f:
            json.dump({"done": done}, f)
        os.replace(tmp, PARTIAL)
    except Exception:
        pass


async def main_async(targets):
    done = load_partial()
    sem = asyncio.Semaphore(CONCURRENCY)
    counter = {"n": 0, "mb": 0.0, "err": 0}

    async def one(url):
        async with sem:
            if url in done:
                return
            try:
                dest = Path("/tmp") / "qr3pre.fits"
                await fetch_ibe(url, dest, use_cache=True)
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                done[url] = True
            except Exception:
                counter["err"] += 1
                done[url + "#ERR"] = True
            counter["n"] += 1
            if counter["n"] % 25 == 0:
                save_partial(done)
                print(f"  {counter['n']} urls, {counter['err']} errors", flush=True)

    # Rebuild download queue from a previous listing pass (resume path).
    # Old-format entries (mjd lists, no urls) are dropped for re-query.
    listed = done.setdefault("_listed", {})
    for key in [k for k, v in listed.items() if not (isinstance(v, dict) and "urls" in v)]:
        del listed[key]
    queue = []
    for key, entry in listed.items():
        for u in entry["urls"]:
            if u not in done:
                queue.append(u)
    if queue:
        print(f"  rebuilt {len(queue)} queued urls from previous listing", flush=True)
    # Build URL queue first (TAP per target x band), then download.
    for i, t in enumerate(targets):
        for bp in t["bps"]:
            key = f"{t['name']}|{bp}"
            if key in done.get("_listed", {}):
                continue
            try:
                rows = await asyncio.to_thread(tap_qr3_newest, t["ra"], t["dec"], bp)
                for r in rows:
                    if r["cutout_url"] not in done:
                        queue.append(r["cutout_url"])
                listed = done.setdefault("_listed", {})
                listed[key] = {"urls": [r["cutout_url"] for r in rows],
                               "mjds": [r["mjd"] for r in rows]}
            except Exception as e:  # noqa: BLE001
                print(f"  TAP miss {t['name']} {bp}: {type(e).__name__}", flush=True)
        if (i + 1) % 25 == 0:
            save_partial(done)
            print(f"  listed {i + 1}/{len(targets)} targets, queue {len(queue)}", flush=True)
    save_partial(done)
    print(f"queue: {len(queue)} urls", flush=True)
    for j in range(0, len(queue), 200):
        await asyncio.gather(*[one(u) for u in queue[j:j + 200]])
    save_partial(done)
    print(f"done: {counter['n']} fetched, {counter['err']} errors", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    targets = load_targets(args.limit)
    print(f"{len(targets)} qr3-covered targets", flush=True)
    asyncio.run(main_async(targets))


if __name__ == "__main__":
    main()
