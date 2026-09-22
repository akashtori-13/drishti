"""Software turntable renderer for the procedural SPHEREx model.

No OpenGL, no Blender: a numpy rasterizer with z-buffer, smooth normals,
Blinn-Phong speculars, Fresnel rim, and a two-source environment (warm sun
key near the horizon + cool earthshine fill from below) matching the SSO
dawn/dusk lighting of the real orbit.

Usage:
  .venv/Scripts/python scripts/render_turntable.py [--frames 48] [--size 640]

Outputs (assets/orbital/render/):
  frame_000.webp ...        individual frames (debug)
  spherex_turntable.webp    N-col sprite sheet, sRGB, web-ready
  poster.webp               single hero still (frame 0)
"""

from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
NPZ = os.path.join(HERE, "..", "assets", "orbital", "model", "spherex.npz")
OUT = os.path.join(HERE, "..", "assets", "orbital", "render")


def load_scene():
    d = np.load(NPZ, allow_pickle=True)
    names = [str(x) for x in d["names"]]
    mat_index = d["mat_index"]
    mat_props = d["mat_props"]  # (m, 5): rgb, metallic, roughness
    pos, nrm, tri, tmat = [], [], [], []
    off = 0
    for k in range(len(names)):
        p, n, i = d[f"p{k}"], d[f"n{k}"], d[f"i{k}"].reshape(-1, 3)
        pos.append(p)
        nrm.append(n)
        tri.append(i + off)
        tmat.append(np.full(len(i), mat_index[k], np.int32))
        off += len(p)
    return (np.vstack(pos).astype(np.float64), np.vstack(nrm).astype(np.float64),
            np.vstack(tri), np.concatenate(tmat), mat_props.astype(np.float64))


def look_at(eye, center, up):
    f = center - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, up)
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    return np.stack([r, u, -f], axis=0)  # rows: right, up, -forward


SCENE = None


def render(yaw_deg: float, size: int, ss: int = 2) -> np.ndarray:
    pos, nrm, tri, tmat, props = SCENE
    S = size * ss
    el = np.radians(21)
    yaw = np.radians(yaw_deg)
    dist = 5.6
    eye = np.array([dist * np.cos(el) * np.cos(yaw),
                    dist * np.cos(el) * np.sin(yaw),
                    dist * np.sin(el) + 0.55])
    center = np.array([0.0, 0.0, 0.62])
    M = look_at(eye, center, np.array([0.0, 0.0, 1.0]))
    cam = (pos - eye) @ M.T
    cnorm = (nrm @ M.T).astype(np.float32)
    fl = 1.0 / np.tan(np.radians(34) / 2)
    z = -cam[:, 2]
    valid = z > 0.05
    sx = (fl * cam[:, 0] / np.maximum(z, 1e-9) * (S / 2) + S / 2).astype(np.float32)
    sy = (-fl * cam[:, 1] / np.maximum(z, 1e-9) * (S / 2) + S / 2).astype(np.float32)

    # vectorized per-triangle setup + culling
    xs = sx[tri]  # (T,3)
    ys = sy[tri]
    zs = z[tri]
    area = ((xs[:, 1] - xs[:, 0]) * (ys[:, 2] - ys[:, 0])
            - (xs[:, 2] - xs[:, 0]) * (ys[:, 1] - ys[:, 0]))
    ok = valid[tri].all(axis=1) & (area > 0)
    x0 = np.clip(np.floor(xs.min(axis=1)).astype(np.int32), 0, S - 1)
    x1 = np.clip(np.ceil(xs.max(axis=1)).astype(np.int32), 0, S - 1)
    y0 = np.clip(np.floor(ys.min(axis=1)).astype(np.int32), 0, S - 1)
    y1 = np.clip(np.ceil(ys.max(axis=1)).astype(np.int32), 0, S - 1)
    ok &= (x1 > x0) & (y1 > y0)
    order = np.argsort(-zs.mean(axis=1))  # far to near (less z-fail rework)
    order = order[ok[order]]

    img = np.zeros((S, S, 3), np.float32)   # indexed [x, y] during raster
    zbuf = np.full((S, S), np.inf, np.float32)

    sun_w = np.array([-0.55, -0.30, 0.78])
    L = M @ sun_w
    L = (L / np.linalg.norm(L)).astype(np.float32)
    sun_col = (np.array([1.25, 1.12, 0.95]) * 1.6).astype(np.float32)
    fill_w = np.array([0.2, 0.15, -1.0])
    Lf = M @ fill_w
    Lf = (Lf / np.linalg.norm(Lf)).astype(np.float32)
    fill_col = (np.array([0.35, 0.45, 0.72]) * 0.32).astype(np.float32)
    amb_col = np.array([0.045, 0.05, 0.075], np.float32)
    H = L + np.array([0.0, 0.0, 1.0], np.float32)
    H /= np.linalg.norm(H)

    for t in order:
        xa, ya, xb, yb = x0[t], y0[t], x1[t], y1[t]
        gx, gy = np.ogrid[xa:xb + 1, ya:yb + 1]
        gx = gx.astype(np.float32) + 0.5
        gy = gy.astype(np.float32) + 0.5
        a = area[t]
        xt, yt, zt = xs[t], ys[t], zs[t]
        w0 = ((yt[1] - yt[2]) * (gx - xt[2]) + (xt[2] - xt[1]) * (gy - yt[2])) / a
        w1 = ((yt[2] - yt[0]) * (gx - xt[2]) + (xt[0] - xt[2]) * (gy - yt[2])) / a
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        pz = w0 * zt[0] + w1 * zt[1] + w2 * zt[2]
        zb = zbuf[xa:xb + 1, ya:yb + 1]
        mask = inside & (pz < zb)
        if not mask.any():
            continue
        zb[mask] = pz[mask]

        ia, ib, ic = tri[t]
        nx = w0 * cnorm[ia, 0] + w1 * cnorm[ib, 0] + w2 * cnorm[ic, 0]
        ny = w0 * cnorm[ia, 1] + w1 * cnorm[ib, 1] + w2 * cnorm[ic, 1]
        nz = w0 * cnorm[ia, 2] + w1 * cnorm[ib, 2] + w2 * cnorm[ic, 2]
        nl = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12
        nx, ny, nz = nx / nl, ny / nl, nz / nl
        sgn = np.where(nz > 0, np.float32(1), np.float32(-1))
        nx, ny, nz = nx * sgn, ny * sgn, nz * sgn

        m = props[tmat[t]].astype(np.float32)
        base, metallic, rough = m[:3], m[3], max(0.06, float(m[4]))
        ndl = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, None)
        ndh = np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0, None)
        shin = np.float32(2.0 / (rough * rough) - 2.0)
        spec = ndh ** shin * np.float32((shin + 2) / 8)
        fres = (1 - np.clip(nz, 0, 1)) ** 4
        ndf = np.clip(nx * Lf[0] + ny * Lf[1] + nz * Lf[2], 0, None)

        spec_col = base * metallic + 0.04 * (1 - metallic)
        col = (base * (1 - metallic * 0.85) * (ndl[..., None] * sun_col)
               + (spec * ndl)[..., None] * spec_col * sun_col * (1.2 + 2.0 * metallic)
               + base * (ndf[..., None] * fill_col)
               + base * amb_col
               + fres[..., None] * spec_col * (0.22 * sun_col))
        sub = img[xa:xb + 1, ya:yb + 1]
        sub[mask] = col[mask]

    img = img.transpose(1, 0, 2)  # raster was [x, y]; image is [y, x]
    img = 1.0 - np.exp(-img * 1.6)
    img = np.clip(img, 0, 1) ** (1 / 2.2)
    if ss > 1:
        img = img.reshape(size, ss, size, ss, 3).mean(axis=(1, 3))
    return (img * 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--size", type=int, default=640)
    ap.add_argument("--cols", type=int, default=8)
    args = ap.parse_args()

    global SCENE
    SCENE = load_scene()
    os.makedirs(OUT, exist_ok=True)

    frames = []
    for k in range(args.frames):
        yaw = 360.0 * k / args.frames
        img = render(yaw, args.size)
        frames.append(img)
        im = Image.fromarray(img)
        im.save(os.path.join(OUT, f"frame_{k:03d}.webp"), quality=88)
        if k == 0:
            im.save(os.path.join(OUT, "poster.webp"), quality=92)
        print(f"frame {k + 1}/{args.frames} yaw={yaw:.1f}", flush=True)

    rows = (args.frames + args.cols - 1) // args.cols
    sheet = np.zeros((rows * args.size, args.cols * args.size, 3), np.uint8)
    for k, img in enumerate(frames):
        r, c = divmod(k, args.cols)
        sheet[r * args.size:(r + 1) * args.size,
              c * args.size:(c + 1) * args.size] = img
    sheet_path = os.path.join(OUT, "spherex_turntable.webp")
    Image.fromarray(sheet).save(sheet_path, quality=85)
    print(f"sprite sheet: {sheet.shape[1]}x{sheet.shape[0]} "
          f"({os.path.getsize(sheet_path)} bytes)")


if __name__ == "__main__":
    main()
