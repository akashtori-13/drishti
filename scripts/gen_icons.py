"""Generate STELLAR PWA/native icon set from brand colors.

Usage: .venv/bin/python scripts/gen_icons.py
Writes: spectrahunt-web/public/icons/{icon-192,icon-512,maskable-512,apple-touch-180}.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (5, 6, 12, 255)
RING = (124, 131, 253, 255)
CORE = (238, 240, 248, 255)
OUT = Path(__file__).parent.parent / "spectrahunt-web" / "public" / "icons"


def draw_mark(size: int, pad_frac: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = int(size * pad_frac)
    box = size - 2 * pad
    # ring
    d.ellipse([pad, pad, pad + box, pad + box], outline=RING, width=max(2, size // 24))
    # core dot
    r = box * 0.16
    cx = cy = size / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CORE)
    return img


def rounded(img: Image.Image, radius_frac: float = 0.225) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=int(size * radius_frac), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        ("icon-192.png", 192, 0.16, True),
        ("icon-512.png", 512, 0.16, True),
        ("maskable-512.png", 512, 0.28, False),  # full-bleed, artwork in safe zone
        ("apple-touch-180.png", 180, 0.16, True),
    ]
    for name, size, pad, rnd in specs:
        img = draw_mark(size, pad)
        if rnd:
            img = rounded(img)
        img.save(OUT / name)
        print(f"wrote {OUT / name} ({size}x{size})")
    # Tauri bundle icons (same artwork, one source)
    tdir = Path(__file__).parent.parent / "desktop" / "src-tauri" / "icons"
    tdir.mkdir(parents=True, exist_ok=True)
    for size, name in [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")]:
        rounded(draw_mark(size, 0.16), 0.0).save(tdir / name)
        print(f"wrote {tdir / name}")
    draw_mark(256, 0.16).save(tdir / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"wrote {tdir / 'icon.ico'}")


if __name__ == "__main__":
    main()
