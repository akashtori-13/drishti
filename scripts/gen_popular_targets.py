#!/usr/bin/env python3
"""Generate spectrahunt-web/public/data/popular-targets.json from
data/popular_targets.txt (name | RA_deg | Dec_deg | type).

File order is preserved: the list is curated famous-first (Messier, bright
stars, ...), so clients can treat position as a popularity proxy. Emits every
target; the Featured page shows the first 1000.

Run manually after editing the txt, and before `next build` (wired as part
of `prebuild`). Deterministic.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
TXT = ROOT / "data" / "popular_targets.txt"
OUT = ROOT / "spectrahunt-web" / "public" / "data" / "popular-targets.json"


def slug(name: str, i: int) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return f"pop-{i:04d}-{s[:40]}" if s else f"pop-{i:04d}"


def main() -> None:
    targets: list[dict] = []
    for line in TXT.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 4:
            continue
        name, ra, dec, typ = parts[0], parts[1], parts[2], parts[3]
        try:
            ra_f, dec_f = float(ra), float(dec)
        except ValueError:
            continue
        targets.append({"id": slug(name, len(targets) + 1), "name": name,
                        "ra": ra_f, "dec": dec_f, "type": typ})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(targets))
    print(f"popular-targets.json: {len(targets)} targets ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
