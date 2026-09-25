"""Generate all DRISHTI icon/logo variations from the new brand mark.

Single source of truth:
  spectrahunt-web/public/icons/mark.svg           (currentColor, UI sprite / docs)
  spectrahunt-web/public/icons/mark-white.svg     (white on transparent)
  spectrahunt-web/public/icons/mark-black.svg     (black on transparent)
  spectrahunt-web/public/icons/app-icon-dark.svg  (white mark on dark gradient, square full-bleed)
  spectrahunt-web/public/icons/app-icon-dark-squircle.svg  (same art, superellipse clip)

Usage: .venv/bin/python scripts/gen_icons.py
Requires: rsvg-convert (system), Pillow (venv).

Writes:
  PWA/web:  public/icons/{icon-192,icon-512} (squircle), {maskable-512,apple-touch-180} (square)
            public/og-image.png + src/app/opengraph-image.png (1200x630)
            src/app/icon.svg (squircle), src/app/favicon.ico (squircle, 16/32/48)
  Desktop:  desktop/src-tauri/icons/{32x32,128x128,128x128@2x}.png + icon.ico (squircle)
  Android:  mipmap-*/{ic_launcher (squircle),ic_launcher_round,ic_launcher_foreground}.png
            + splash.png set (dark + white mark)
Also syncs android ic_launcher_background color to #05060c.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent.parent
WEB = ROOT / "spectrahunt-web"
ICONS = WEB / "public" / "icons"
MARK_WHITE = ICONS / "mark-white.svg"
APP_DARK = ICONS / "app-icon-dark.svg"
SQUIRCLE = ICONS / "app-icon-dark-squircle.svg"

BG_DARK = (5, 6, 12, 255)
THEME_HEX = "#05060c"


def need_rsvg() -> str:
    exe = shutil.which("rsvg-convert")
    if not exe:
        sys.exit("error: rsvg-convert not found (install librsvg)")
    return exe


def rsvg_png(svg: Path, size: int, out: Path, square: int | None = None) -> None:
    """Render square SVG to PNG with longest side == size."""
    exe = need_rsvg()
    s = size if square is None else square
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([exe, "-w", str(s), "-h", str(s), "-o", str(out), str(svg)],
                   check=True)


def rsvg_to_pil(svg: Path, size: int) -> Image.Image:
    exe = need_rsvg()
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        tmp = Path(tf.name)
    try:
        subprocess.run([exe, "-w", str(size), "-h", str(size), "-o", str(tmp), str(svg)],
                       check=True)
        return Image.open(tmp).convert("RGBA")
    finally:
        tmp.unlink(missing_ok=True)


def circled(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> None:
    for p in (MARK_WHITE, APP_DARK, SQUIRCLE):
        if not p.exists():
            sys.exit(f"error: missing source {p}")
    need_rsvg()

    # -- Next.js file-convention SVG (/icon.svg) mirrors the squircle app icon --
    app_svg = (WEB / "src" / "app" / "icon.svg")
    app_svg.write_text(SQUIRCLE.read_text())
    print(f"wrote {app_svg}")

    # -- PWA --
    # maskable + apple-touch stay square full-bleed (the OS applies its own mask);
    # install icons ship the squircle shape with transparency.
    tmp512 = rsvg_to_pil(APP_DARK, 512)
    tmp512.save(ICONS / "maskable-512.png")  # full-bleed square, safe-zone art
    print(f"wrote {ICONS / 'maskable-512.png'} (512x512)")
    rsvg_png(SQUIRCLE, 512, ICONS / "icon-512.png")
    print(f"wrote {ICONS / 'icon-512.png'} (512x512 squircle)")
    rsvg_png(SQUIRCLE, 192, ICONS / "icon-192.png")
    print(f"wrote {ICONS / 'icon-192.png'} (192x192 squircle)")
    rsvg_png(APP_DARK, 180, ICONS / "apple-touch-180.png")  # opaque square, iOS rounds it
    print(f"wrote {ICONS / 'apple-touch-180.png'} (180x180)")

    # -- favicon.ico (squircle, dark bg so it reads on light+dark tabs) --
    fav = rsvg_to_pil(SQUIRCLE, 256)  # keep RGBA for Next.js ICO decoder
    fav.save(WEB / "src" / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {WEB / 'src/app/favicon.ico'}")

    # -- Tauri (squircle with transparency; OS shells composite it) --
    tdir = ROOT / "desktop" / "src-tauri" / "icons"
    tdir.mkdir(parents=True, exist_ok=True)
    for size, name in [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")]:
        rsvg_png(SQUIRCLE, size, tdir / name)
        print(f"wrote {tdir / name}")
    ico_src = rsvg_to_pil(SQUIRCLE, 256)  # keep RGBA
    ico_src.save(tdir / "icon.ico",
                 sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"wrote {tdir / 'icon.ico'}")

    # -- Android --
    res = WEB / "android" / "app" / "src" / "main" / "res"
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    fg_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    for dpi, size in densities.items():
        base = rsvg_to_pil(SQUIRCLE, size)
        base.save(res / f"mipmap-{dpi}" / "ic_launcher.png")
        circled(rsvg_to_pil(APP_DARK, size)).save(res / f"mipmap-{dpi}" / "ic_launcher_round.png")
        print(f"wrote mipmap-{dpi}/ic_launcher[.round].png ({size})")
    # Adaptive foreground: white mark on transparent, ~62% of canvas (safe zone).
    for dpi, size in fg_sizes.items():
        mark = rsvg_to_pil(MARK_WHITE, max(1, int(size * 0.62)))
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fg.paste(mark, ((size - mark.size[0]) // 2, (size - mark.size[1]) // 2), mark)
        fg.save(res / f"mipmap-{dpi}" / "ic_launcher_foreground.png")
        print(f"wrote mipmap-{dpi}/ic_launcher_foreground.png ({size})")
    bg_color = res / "values" / "ic_launcher_background.xml"
    if bg_color.exists():
        bg_color.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">{THEME_HEX.upper()}</color>\n'
            '</resources>\n')
        print(f"wrote {bg_color} -> {THEME_HEX.upper()}")

    # -- Android splash set (dark bg + centered white mark) --
    splash_specs = [
        ("drawable-land-hdpi", 800, 480), ("drawable-land-mdpi", 480, 320),
        ("drawable-land-xhdpi", 1280, 720), ("drawable-land-xxhdpi", 1600, 960),
        ("drawable-land-xxxhdpi", 1920, 1280), ("drawable-port-hdpi", 480, 800),
        ("drawable-port-mdpi", 320, 480), ("drawable-port-xhdpi", 720, 1280),
        ("drawable-port-xxhdpi", 960, 1600), ("drawable-port-xxxhdpi", 1280, 1920),
        ("drawable", 480, 320),
    ]
    for folder, w, h in splash_specs:
        mark_side = int(min(w, h) * 0.34)
        mark = rsvg_to_pil(MARK_WHITE, mark_side)
        canvas = Image.new("RGBA", (w, h), BG_DARK)
        canvas.paste(mark, ((w - mark_side) // 2, (h - mark_side) // 2), mark)
        canvas.convert("RGB").save(res / folder / "splash.png")
        print(f"wrote {folder}/splash.png ({w}x{h})")

    # -- Share image (1200x630, dark + centered white mark) --
    ow, oh = 1200, 630
    oside = int(min(ow, oh) * 0.52)
    omark = rsvg_to_pil(MARK_WHITE, oside)
    og = Image.new("RGBA", (ow, oh), BG_DARK)
    og.paste(omark, ((ow - oside) // 2, (oh - oside) // 2), omark)
    og.convert("RGB").save(WEB / "public" / "og-image.png")
    og.convert("RGB").save(WEB / "src" / "app" / "opengraph-image.png")
    print("wrote public/og-image.png + src/app/opengraph-image.png (1200x630)")


if __name__ == "__main__":
    main()
