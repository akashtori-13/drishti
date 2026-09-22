"""Procedural SPHEREx spacecraft model, built from official NASA/JPL references.

References (assets/orbital/reference/):
  - PIA26531 in-orbit render: cone stack proportions, deck ring, bus, panel
  - spacecraft_work_stand.jpg: outer cone seam/fastener layout, gold MLI band
  - concentric_cones.jpg: nested shield spacing
  - outer_photon_shield.jpg: cone surface finish

Geometry (meters, axis = +Z up through the photon-shield stack):
  overall height ~2.6 m; width with solar wing ~3.2 m; launch mass 502 kg.

Materials follow glTF metallic-roughness so the same meshes render in our
numpy turntable renderer now and in any glTF viewer later.

Outputs:
  assets/orbital/model/spherex.glb   (binary glTF 2.0)
  assets/orbital/model/spherex.npz   (meshes for the numpy renderer)
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass

import numpy as np

# ---------------------------------------------------------------- primitives

TAU = 2.0 * np.pi


@dataclass
class Mesh:
    name: str
    material: str
    positions: np.ndarray  # (n, 3)
    normals: np.ndarray    # (n, 3)
    indices: np.ndarray    # (m,) uint32 triangle list


def frustum(r0: float, r1: float, z0: float, z1: float, seg: int = 96,
            cap0: bool = False, cap1: bool = False) -> tuple:
    """Open cone/cylinder wall around +Z. r0 at z0 (bottom), r1 at z1 (top).
    Returns (positions, normals, indices) with smooth side normals."""
    pos, nrm, idx = [], [], []
    slope = (r0 - r1) / max(1e-9, (z1 - z0))  # dr/dz
    for i in range(seg):
        a = TAU * i / seg
        ca, sa = np.cos(a), np.sin(a)
        n = np.array([ca, sa, slope])
        n /= np.linalg.norm(n)
        for r, z in ((r0, z0), (r1, z1)):
            pos.append([r * ca, r * sa, z])
            nrm.append(n.tolist())
    for i in range(seg):
        j = (i + 1) % seg
        a, b = 2 * i, 2 * j
        idx += [a, b, a + 1, b, b + 1, a + 1]
    base = len(pos)
    if cap0:
        pos.append([0, 0, z0]); nrm.append([0, 0, -1])
        c = base
        for i in range(seg):
            j = (i + 1) % seg
            idx += [c, 2 * j, 2 * i]
    if cap1:
        pos.append([0, 0, z1]); nrm.append([0, 0, 1])
        c = len(pos) - 1
        for i in range(seg):
            j = (i + 1) % seg
            idx += [c, 2 * i + 1, 2 * j + 1]
    return (np.array(pos, np.float32), np.array(nrm, np.float32),
            np.array(idx, np.uint32))


def box(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> tuple:
    """Axis-aligned box centered at (cx,cy,cz) with sizes (sx,sy,sz)."""
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z0, z1 = cz - sz / 2, cz + sz / 2
    faces = [
        ([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]),
        ([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]),
        ([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]),
        ([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]),
        ([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]),
        ([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]),
    ]
    pos, nrm, idx = [], [], []
    for verts, n in faces:
        b = len(pos)
        pos += verts
        nrm += [n] * 4
        idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    return (np.array(pos, np.float32), np.array(nrm, np.float32),
            np.array(idx, np.uint32))


def prism_ngon(n: int, r: float, z0: float, z1: float) -> tuple:
    """n-sided vertical prism (flat-shaded sides, capped both ends)."""
    pos, nrm, idx = [], [], []
    for i in range(n):
        a0, a1 = TAU * i / n, TAU * (i + 1) / n
        p0 = [r * np.cos(a0), r * np.sin(a0), z0]
        p1 = [r * np.cos(a1), r * np.sin(a1), z0]
        p2 = [r * np.cos(a1), r * np.sin(a1), z1]
        p3 = [r * np.cos(a0), r * np.sin(a0), z1]
        mid = (a0 + a1) / 2
        fn = [np.cos(mid), np.sin(mid), 0]
        b = len(pos)
        pos += [p0, p1, p2, p3]
        nrm += [fn] * 4
        idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    # caps
    bc = len(pos)
    pos.append([0, 0, z0]); nrm.append([0, 0, -1])
    tc = len(pos)
    pos.append([0, 0, z1]); nrm.append([0, 0, 1])
    for i in range(n):
        j = (i + 1) % n
        b0, b1 = 4 * i, 4 * j
        idx += [bc, b1, b0]
        idx += [tc, b0 + 2, b1 + 2]
    return (np.array(pos, np.float32), np.array(nrm, np.float32),
            np.array(idx, np.uint32))


def combine(parts: list[tuple]) -> tuple:
    pos, nrm, idx = [], [], []
    off = 0
    for p, n, i in parts:
        pos.append(p); nrm.append(n); idx.append(i + off)
        off += len(p)
    return (np.vstack(pos), np.vstack(nrm), np.concatenate(idx))


# ---------------------------------------------------------------- materials

MATERIALS: dict[str, dict] = {
    # white painted photon shields (matte-ceramic look from work-stand photo)
    "shield_white": {"baseColor": [0.92, 0.93, 0.95, 1.0], "metallic": 0.0, "roughness": 0.42},
    # cone interiors: slightly darker, still painted
    "shield_inner": {"baseColor": [0.78, 0.80, 0.84, 1.0], "metallic": 0.0, "roughness": 0.55},
    # machined silver deck ring / separation ring
    "aluminum": {"baseColor": [0.75, 0.77, 0.80, 1.0], "metallic": 0.9, "roughness": 0.32},
    # gold MLI blankets (bus band + instrument boxes)
    "mli_gold": {"baseColor": [0.83, 0.55, 0.17, 1.0], "metallic": 0.85, "roughness": 0.30},
    # white thermal boxes on the bus
    "box_white": {"baseColor": [0.88, 0.89, 0.91, 1.0], "metallic": 0.05, "roughness": 0.5},
    # solar cells: very dark blue, semi glossy
    "solar_cell": {"baseColor": [0.04, 0.07, 0.15, 1.0], "metallic": 0.1, "roughness": 0.3},
    # panel substrate / back
    "panel_back": {"baseColor": [0.30, 0.24, 0.11, 1.0], "metallic": 0.1, "roughness": 0.5},
    # dark apertures (telescope opening, thruster nozzles, antenna dish dark face)
    "aperture": {"baseColor": [0.02, 0.02, 0.03, 1.0], "metallic": 0.2, "roughness": 0.6},
}


# ---------------------------------------------------------------- the spacecraft

def build() -> list[Mesh]:
    """SPHEREx, +Z up (boresight), origin at deck/business end center."""
    meshes: list[Mesh] = []

    # -- photon shield stack (3 nested open cones, from PIA26531 + cones photo)
    #    outer cone dominates the silhouette: rim ~0.95 m radius, half-angle ~37°
    cones = [
        # (name, bottom radius, top radius, z bottom, z top)
        ("shield_outer", 0.30, 0.95, 0.62, 1.85),
        ("shield_mid",   0.24, 0.68, 0.86, 1.72),
        ("shield_inner", 0.18, 0.44, 1.06, 1.56),
    ]
    for name, r0, r1, z0, z1 in cones:
        p, n, i = frustum(r0, r1, z0, z1)
        meshes.append(Mesh(name, "shield_white", p, n, i))
        # inner wall: same cone, flipped winding + flipped normals
        p2, n2, i2 = p.copy(), -n.copy(), i.copy()
        i2 = i2.reshape(-1, 3)[:, ::-1].reshape(-1)
        meshes.append(Mesh(f"{name}_inner", "shield_inner", p2, n2, i2))
        # thin rim lip (torus-ish: short cylinder at the rim)
        p3, n3, i3 = frustum(r1, r1 + 0.012, z1 - 0.02, z1)
        meshes.append(Mesh(f"{name}_rim", "aluminum", p3, n3, i3))

    # -- telescope tube peeking out of the inner cone (dark cavity + silver rim)
    p, n, i = frustum(0.10, 0.115, 1.20, 1.44, cap1=False)
    meshes.append(Mesh("telescope_tube", "aluminum", p, n, i))
    p, n, i = frustum(0.098, 0.098, 1.42, 1.43, cap1=True)
    meshes.append(Mesh("telescope_aperture", "aperture", p, n, i))

    # -- deck ring: machined cylinder the outer cone bolts onto
    p, n, i = frustum(0.42, 0.44, 0.50, 0.62)
    meshes.append(Mesh("deck_ring", "aluminum", p, n, i))
    # gold MLI band visible between deck and bus (work-stand photo)
    p, n, i = frustum(0.40, 0.42, 0.34, 0.50)
    meshes.append(Mesh("mli_band", "mli_gold", p, n, i))

    # -- spacecraft bus: octagonal prism
    p, n, i = prism_ngon(8, 0.44, -0.28, 0.34)
    meshes.append(Mesh("bus", "box_white", p, n, i))
    # gold instrument boxes on the bus (from the render's visible avionics)
    p, n, i = box(0.30, -0.28, -0.02, 0.26, 0.18, 0.34)
    meshes.append(Mesh("avionics_a", "mli_gold", p, n, i))
    p, n, i = box(-0.34, 0.16, 0.02, 0.16, 0.24, 0.28)
    meshes.append(Mesh("avionics_b", "mli_gold", p, n, i))
    # cylindrical reaction/component can on the bus side (render: right side)
    p, n, i = frustum(0.09, 0.09, 0.0, 0.001)
    p[:, 0], p[:, 2] = p[:, 2] + 0.0, p[:, 0]  # lay along X
    p[:, 0] += 0.46
    meshes.append(Mesh("gyro_can", "aluminum", p, n, i))

    # -- separation ring at the base
    p, n, i = frustum(0.40, 0.42, -0.40, -0.28)
    meshes.append(Mesh("sep_ring", "aluminum", p, n, i))

    # -- solar wing: single dark panel on a yoke, extending -X, tilted ~22°
    #    around Y so it reads as a wing (matches PIA26531), 3.2 m tip-to-cone
    def tilt(part, deg, pivot=(-0.36, 0.0, -0.05)):
        p, n, i = part
        a = np.radians(deg)
        R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        p = (p - np.array(pivot)) @ R.T + np.array(pivot)
        n = n @ R.T
        return p, n, i

    p, n, i = tilt(box(-1.02, 0.0, -0.05, 1.35, 0.62, 0.03), 22)
    meshes.append(Mesh("solar_panel", "solar_cell", p, n, i))
    p, n, i = box(-0.36, 0.0, -0.05, 0.10, 0.14, 0.10)   # yoke
    meshes.append(Mesh("solar_yoke", "aluminum", p, n, i))
    # panel back (dark gold substrate) — thin shell just below the cells
    p, n, i = tilt(box(-1.02, 0.0, -0.072, 1.37, 0.64, 0.012), 22)
    meshes.append(Mesh("solar_back", "panel_back", p, n, i))

    # -- low-gain antenna nub under the bus
    p, n, i = frustum(0.03, 0.05, -0.52, -0.40)
    meshes.append(Mesh("antenna", "aluminum", p, n, i))

    return meshes


# ---------------------------------------------------------------- export

def to_glb(meshes: list[Mesh], path: str) -> None:
    """Minimal binary glTF 2.0 writer: positions, normals, indices, materials."""
    bin_parts: list[bytes] = []
    accessors, views, gltf_meshes, nodes = [], [], [], []
    offset = 0

    def push(data: bytes, target: int) -> int:
        nonlocal offset
        pad = (4 - offset % 4) % 4
        if pad:
            bin_parts.append(b"\x00" * pad)
            offset += pad
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data),
                      "target": target})
        bin_parts.append(data)
        offset += len(data)
        return len(views) - 1

    mat_index: dict[str, int] = {}
    mats = []
    for name, m in MATERIALS.items():
        mat_index[name] = len(mats)
        mats.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": m["baseColor"],
                "metallicFactor": m["metallic"],
                "roughnessFactor": m["roughness"],
            },
            "doubleSided": False,
        })

    for mi, mesh in enumerate(meshes):
        pv = push(mesh.positions.astype("<f4").tobytes(), 34962)
        nv = push(mesh.normals.astype("<f4").tobytes(), 34962)
        iv = push(mesh.indices.astype("<u4").tobytes(), 34963)
        pmin = mesh.positions.min(axis=0).tolist()
        pmax = mesh.positions.max(axis=0).tolist()
        pa = len(accessors)
        accessors.append({"bufferView": pv, "componentType": 5126,
                          "count": int(len(mesh.positions)), "type": "VEC3",
                          "min": pmin, "max": pmax})
        accessors.append({"bufferView": nv, "componentType": 5126,
                          "count": int(len(mesh.normals)), "type": "VEC3"})
        accessors.append({"bufferView": iv, "componentType": 5125,
                          "count": int(len(mesh.indices)), "type": "SCALAR"})
        gltf_meshes.append({"name": mesh.name, "primitives": [{
            "attributes": {"POSITION": pa, "NORMAL": pa + 1},
            "indices": pa + 2,
            "material": mat_index[mesh.material],
        }]})
        nodes.append({"name": mesh.name, "mesh": mi})

    bin_blob = b"".join(bin_parts)
    gltf = {
        "asset": {"version": "2.0", "generator": "stellar build_spherex_model"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "materials": mats,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_blob += b"\x00" * ((4 - len(bin_blob) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(bin_blob), b"BIN\x00") + bin_blob)


def to_npz(meshes: list[Mesh], path: str) -> None:
    """Flat arrays for the numpy turntable renderer."""
    names = [m.name for m in meshes]
    mats = np.array([list(MATERIALS).index(m.material) for m in meshes], np.int32)
    out: dict[str, np.ndarray] = {"mat_index": mats}
    for k, m in enumerate(meshes):
        out[f"p{k}"] = m.positions
        out[f"n{k}"] = m.normals
        out[f"i{k}"] = m.indices
    mat_props = np.array(
        [[*m["baseColor"][:3], m["metallic"], m["roughness"]]
         for m in MATERIALS.values()], np.float32)
    out["mat_props"] = mat_props
    np.savez_compressed(path, names=np.array(names), **out)


if __name__ == "__main__":
    import os

    outdir = os.path.join(os.path.dirname(__file__), "..", "assets", "orbital", "model")
    os.makedirs(outdir, exist_ok=True)
    built = build()
    glb = os.path.join(outdir, "spherex.glb")
    npz = os.path.join(outdir, "spherex.npz")
    to_glb(built, glb)
    to_npz(built, npz)
    tris = sum(len(m.indices) // 3 for m in built)
    verts = sum(len(m.positions) for m in built)
    print(f"{len(built)} meshes, {verts} verts, {tris} tris")
    print(f"wrote {glb} ({os.path.getsize(glb)} bytes)")
    print(f"wrote {npz} ({os.path.getsize(npz)} bytes)")

