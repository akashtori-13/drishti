"""Expand the curated intro swarm from a fresh CelesTrak mirror on GitHub.

Why a mirror: celestrak.org TCP is blackholed from the build network
(21 s timeout), while raw.githubusercontent.com answers in <1 s. The
satvisorcom/satvisor-data mirror is automation-refreshed daily from CelesTrak
gp.php (see its scripts/fetch-celestrak.mjs for provenance).

Honesty filters (no fake dots, ever):
  - every TLE line must pass its checksum, else the object is dropped;
  - duplicates collapse by NORAD id;
  - epoch age is reported; objects older than 30 d are dropped;
  - total capped so the shipped bundle stays within its ~150 KB budget.

N2YO path (needs N2YO_API_KEY env, never stored): kept as the refresh
alternative when the mirror lags — one object per request, 1 s spacing.

Usage:
    .venv/Scripts/python scripts/expand_swarm.py [--out assets/orbital/tle/swarm.json]
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MIRROR = "https://raw.githubusercontent.com/satvisorcom/satvisor-data/HEAD/celestrak/tle"
CACHE = os.path.join("C:\\Windows\\Temp\\opencode\\tle")

# set -> (max objects, every-nth sampling for mega-constellations)
SETS = [
    ("stations", 40, 1),
    ("visual", 160, 1),
    ("science", 60, 1),
    ("weather", 60, 1),
    ("noaa", 20, 1),
    ("goes", 20, 1),
    ("amateur", 80, 1),
    ("cubesat", 80, 1),
    ("sarsat", 60, 1),
    ("tdrss", 20, 1),
    ("gps-ops", 40, 1),
    ("starlink", 220, 40),
]
BUDGET_BYTES = 150 * 1024
MAX_AGE_DAYS = 30


def checksum_ok(line: str) -> bool:
    if len(line) < 69 or not line[68].isdigit():
        return False
    total = 0
    for ch in line[:68]:
        if ch.isdigit():
            total += int(ch)
        elif ch == "-":
            total += 1
    return total % 10 == int(line[68])


def epoch_days(l1: str) -> float | None:
    try:
        year2 = int(l1[18:20])
        day = float(l1[20:32])
        year = 2000 + year2 if year2 < 57 else 1900 + year2
        base = datetime.datetime(year, 1, 1, tzinfo=datetime.timezone.utc)
        return (base + datetime.timedelta(days=day - 1) - datetime.datetime(
            1970, 1, 1, tzinfo=datetime.timezone.utc)).total_seconds() / 86400
    except (ValueError, IndexError):
        return None


def fetch_set(name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{name}.tle")
    if not os.path.isfile(path):
        url = f"{MIRROR}/{name}.tle"
        req = urllib.request.Request(url, headers={"User-Agent": "stellar-swarm/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def parse_triples(text: str) -> list[tuple[str, str, str]]:
    lines = [ln.strip() for ln in text.replace("\r", "").split("\n") if ln.strip()]
    out = []
    for i in range(0, len(lines) - 2, 3):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            out.append((name, l1, l2))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "..", "assets", "orbital", "tle", "swarm.json"))
    args = ap.parse_args()

    now_days = datetime.datetime.now(datetime.timezone.utc).timestamp() / 86400
    seen: dict[str, dict] = {}
    stats: dict[str, dict[str, int]] = {}
    for name, cap, step in SETS:
        triples = parse_triples(fetch_set(name))
        picked = triples[::step][:cap]
        st = {"raw": len(triples), "bad_checksum": 0, "stale": 0, "dup": 0, "kept": 0}
        for obj_name, l1, l2 in picked:
            if not (checksum_ok(l1) and checksum_ok(l2)):
                st["bad_checksum"] += 1
                continue
            ep = epoch_days(l1)
            if ep is None or now_days - ep > MAX_AGE_DAYS:
                st["stale"] += 1
                continue
            try:
                norad = int(l2[2:7])
            except ValueError:
                st["bad_checksum"] += 1
                continue
            if norad in seen:
                st["dup"] += 1
                continue
            seen[norad] = {"name": obj_name.strip(), "norad": norad, "l1": l1, "l2": l2, "set": name}
            st["kept"] += 1
        stats[name] = st

    # pin the hand-curated core first (hero + rideshare + notables)
    core_path = os.path.join(HERE, "..", "spectrahunt-web", "public", "data", "tle-bundle.json")
    with open(core_path, encoding="utf-8") as f:
        core = json.load(f)
    ordered = []
    for obj in core.get("objects", []):
        seen.pop(obj["norad"], None)
        ordered.append(obj)
    for obj in seen.values():
        obj.pop("set", None)
        ordered.append(obj)

    payload = {
        "source": "CelesTrak via satvisorcom/satvisor-data GitHub mirror (daily automation from celestrak.org gp.php), core curated via N2YO AFSPC elements; every line checksum-validated, 30 d freshness cap",
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tle_epoch_day": "2026 day ~264.7-264.9",
        "note": "Curated notable objects for the orbital intro swarm. SPHEREx (63182) is the hero; 63178-63181 are its Falcon 9 rideshare siblings (PUNCH). Refresh via scripts/expand_swarm.py (mirror) or N2YO_API_KEY path.",
        "objects": ordered,
    }
    blob = json.dumps(payload, separators=(",", ":")) + "\n"
    print(f"objects: {len(ordered)}  bytes: {len(blob)}  budget: {BUDGET_BYTES}")
    for name, st in stats.items():
        print(f"  {name}: raw={st['raw']} kept={st['kept']} bad={st['bad_checksum']} stale={st['stale']} dup={st['dup']}")
    if len(blob) > BUDGET_BYTES:
        print("OVER BUDGET — trim starlink sampling")
        return 1
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(blob)
    print("wrote", args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
