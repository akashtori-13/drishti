#!/usr/bin/env python3
"""Generate spectrahunt-web/public/precache.json: every same-origin data URL
the service worker pins at install so the static site works fully offline
for all curated content (showcases, reports, tracks, pairs, ranking,
cutouts, compare frames, data JSONs). ~2.5MB total. Deterministic.

Run before `next build` (wired as `prebuild`). Re-run when public/ changes.
"""
from __future__ import annotations

import json
from pathlib import Path

WEB = Path(__file__).parent.parent / "spectrahunt-web"
PUB = WEB / "public"

DIRS = ["showcases", "reports", "tracks", "pairs", "cutouts", "compare",
        "data", "orbital", "about", "icons"]
FILES = ["coverage.json", "ranking.json", "manifest.webmanifest"]


def main() -> None:
    urls: list[str] = []
    for name in FILES:
        if (PUB / name).is_file():
            urls.append("/" + name)
    for d in DIRS:
        root = PUB / d
        if not root.is_dir():
            continue
        for f in sorted(root.rglob("*")):
            if f.is_file() and f.suffix.lower() in {
                    ".json", ".png", ".jpg", ".jpeg", ".webp", ".svg"}:
                urls.append("/" + str(f.relative_to(PUB)).replace("\\", "/"))
    out = PUB / "precache.json"
    out.write_text(json.dumps(sorted(set(urls)), indent=0))
    kb = out.stat().st_size // 1024
    print(f"precache.json: {len(urls)} urls (list {kb} KB)")


if __name__ == "__main__":
    main()
