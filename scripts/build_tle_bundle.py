"""Promote the curated TLE swarm into the static bundle.

Reads assets/orbital/tle/swarm.json (real AFSPC TLEs, see
docs/ORBITAL_INTRO.md) and writes spectrahunt-web/public/data/tle-bundle.json
— the offline fallback the intro fetches cache-first (getSwarmBundle in
src/lib/orbit.ts). Idempotent; skips objects with unparseable TLE pairs.

Usage:
    .venv/Scripts/python scripts/build_tle_bundle.py
"""

from __future__ import annotations

import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "assets", "orbital", "tle", "swarm.json")
DST = os.path.join(HERE, "..", "spectrahunt-web", "public", "data", "tle-bundle.json")


def valid(obj: dict) -> bool:
    try:
        l1, l2 = obj["l1"], obj["l2"]
        return (
            l1.startswith("1 ") and l2.startswith("2 ")
            and l1[2:7].strip() == l2[2:7].strip() != ""
        )
    except (KeyError, TypeError, IndexError):
        return False


def main() -> int:
    with open(SRC, encoding="utf-8") as f:
        swarm = json.load(f)
    kept, dropped = [], 0
    for obj in swarm.get("objects", []):
        if valid(obj):
            kept.append({
                "name": obj["name"],
                "norad": obj["norad"],
                **({"cospar": obj["cospar"]} if obj.get("cospar") else {}),
                **({"hero": True} if obj.get("hero") else {}),
                "l1": obj["l1"],
                "l2": obj["l2"],
            })
        else:
            dropped += 1
    bundle = {
        "source": swarm.get("source", ""),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(kept),
        "objects": kept,
    }
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(bundle, f, separators=(",", ":"))
        f.write("\n")
    print(f"kept {len(kept)}, dropped {dropped} -> {DST} ({os.path.getsize(DST)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
