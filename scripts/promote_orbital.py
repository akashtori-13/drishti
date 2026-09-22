"""Promote web-optimized orbital-intro assets into the static bundle.

Copies (never the multi-MB sources):
  assets/orbital/earth/web/*.webp      -> spectrahunt-web/public/orbital/
  assets/orbital/render/spherex_turntable.webp, poster.webp -> same

Refuses when the promoted total would exceed 2 MB (intro budget in
docs/ORBITAL_INTRO.md). Idempotent; re-run after any re-render.

Usage:
    .venv/Scripts/python scripts/promote_orbital.py
"""

from __future__ import annotations

import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..", "assets", "orbital", "earth", "web")
RENDER = os.path.join(HERE, "..", "assets", "orbital", "render")
DST = os.path.join(HERE, "..", "spectrahunt-web", "public", "orbital")
BUDGET = 2 * 1024 * 1024

FILES = [
    (WEB, "earth_day.webp"),
    (WEB, "earth_night.webp"),
    (WEB, "earth_clouds.webp"),
    (RENDER, "spherex_turntable.webp"),
    (RENDER, "poster.webp"),
]


def main() -> int:
    os.makedirs(DST, exist_ok=True)
    total, missing = 0, []
    for srcdir, name in FILES:
        src = os.path.join(srcdir, name)
        if not os.path.isfile(src):
            missing.append(src)
            continue
        shutil.copyfile(src, os.path.join(DST, name))
        size = os.path.getsize(src)
        total += size
        print(f"{name} ({size} bytes)")
    if missing:
        print("missing (skipped):")
        for m in missing:
            print(f"  {m}")
    print(f"total {total} bytes (budget {BUDGET})")
    if total > BUDGET:
        print("OVER BUDGET — downscale before committing")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
