#!/usr/bin/env python3
"""Per-array flux+variance extraction for one target (DISTA Experiment 1).

Takes a showcase target, pulls one FITS cutout per detector band (reusing
bundled epoch URLs, discovering the rest via TAP), runs variance-aware
aperture photometry at the target coordinates, and writes per-visit
(mjd, band, wavelength_um, flux, flux_err) triplets plus a slope plot.

Usage:
    .venv/bin/python scripts/extract_track.py --target 3i-atlas [--bands 1,2,3,4,5,6]

Outputs: data/track_<target>.json, data/track_<target>.png
Every point carries its provenance (url or bundle) and flags summary.
A point with no usable pixels is recorded with flux=null, never invented.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from backend.cutouts import fetch_ibe, mask_bad_pixels, parse_fits  # noqa: E402
from backend.epochs import discover_epochs  # noqa: E402
from backend.photometry import aperture_flux  # noqa: E402

WEB = ROOT / "spectrahunt-web"
DATA = ROOT / "data"


def load_showcase(sid: str) -> dict:
    p = WEB / "public" / "showcases" / f"{sid}.json"
    return json.loads(p.read_text())


def bundle_epochs(showcase: dict, bands: list[int]) -> list[dict]:
    out = []
    for e in showcase.get("epochs", []):
        try:
            b = int(e.get("band", 0))
        except (TypeError, ValueError):
            continue
        if b in bands and e.get("cutout_url"):
            out.append({
                "band": b, "mjd": e.get("mjd"), "url": e["cutout_url"],
                "label": e.get("label", ""), "source": "bundle",
            })
    return out


def tap_epochs(ra: float, dec: float, bands: list[int], per_band: int) -> list[dict]:
    out: list[dict] = []
    for b in bands:
        try:
            found = discover_epochs(ra, dec, band=b)
        except Exception as ex:  # noqa: BLE001 - TAP flakes; record and move on
            print(f"  band {b}: TAP failed ({ex})")
            continue
        for f in (found or [])[:per_band]:
            out.append({
                "band": b, "mjd": f.get("mjd"), "url": f.get("cutout_url", ""),
                "label": f.get("label", ""), "source": "tap",
            })
    return out


async def measure(url: str, ra: float, dec: float, tmp: Path) -> dict:
    """One cutout -> flux triple (or flux=null with a reason). Never raises."""
    rec: dict = {"flux": None, "flux_err": None, "wavelength_um": None,
                 "flags": None, "npix": 0}
    try:
        dest = tmp / f"cut_{abs(hash(url)) % 10**8}.fits"
        await fetch_ibe(url, dest)
        parsed = parse_fits(dest)
        img = parsed.get("image")
        if img is None:
            rec["reason"] = "no IMAGE plane"
            return rec
        wcs = parsed.get("wcs")
        if wcs is None:
            rec["reason"] = "no WCS"
            return rec
        try:
            import numpy as np
            x, y = wcs.all_world2pix([[ra, dec]], 0)[0]
        except Exception:
            rec["reason"] = "wcs failed"
            return rec
        h, w = np.asarray(img).shape[:2]
        if not (0 <= x < w and 0 <= y < h):
            rec["reason"] = "target outside cutout"
            return rec
        clean, flags = mask_bad_pixels(img, parsed.get("flags"), parsed.get("variance"))
        hit = aperture_flux(clean, float(x), float(y), variance=parsed.get("variance"))
        # per-visit wavelength: cutout coords -> full-detector pixels via the
        # (full-frame) CRPIX reference, then into the WCS-WAVE grid
        lam, bw = parsed.get("wavelength_um"), None
        try:
            from backend.cutouts import wave_at
            hdr = parsed.get("header", {}) or {}
            lr = wcs.all_world2pix([[float(hdr["CRVAL1"]), float(hdr["CRVAL2"])]], 0)[0]
            fx = float(x) + (float(hdr["CRPIX1"]) - float(lr[0]))
            fy = float(y) + (float(hdr["CRPIX2"]) - float(lr[1]))
            if parsed.get("wave_grid"):
                lam, bw = wave_at(parsed["wave_grid"], fx, fy)
        except Exception:
            pass
        rec.update({"flux": hit["flux"], "flux_err": hit["flux_err"],
                    "npix": hit["npix"],
                    "wavelength_um": lam, "bandwidth_um": bw,
                    "flags": str(flags)[:120] if flags is not None else None})
    except Exception as ex:  # noqa: BLE001 - per-point failure is data, not crash
        rec["reason"] = f"{type(ex).__name__}: {ex}"[:160]
    return rec


async def main_async(args) -> dict:
    bands = [int(x) for x in args.bands.split(",")]
    if getattr(args, "tracked", None):
        return await main_tracked(args, bands)
    if args.target:
        sc = load_showcase(args.target)
        ra, dec, name = sc["ra"], sc["dec"], sc.get("title", args.target)
        wanted = [{"band": b, "mjd": None, "url": "", "label": "", "source": "tap"} for b in bands]
        have = {(e["band"]) for e in bundle_epochs(sc, bands)}
        missing = [b for b in bands if b not in have]
    else:
        ra, dec, name = args.ra, args.dec, f"{args.ra},{args.dec}"
        wanted, missing = [], bands
    points: list[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # bundle epochs first (no network), then TAP for missing bands
        if args.target:
            for e in bundle_epochs(sc, bands):
                print(f"measuring bundle band {e['band']} mjd={e['mjd']} ...", flush=True)
                rec = await measure(e["url"], ra, dec, tmp)
                points.append({**e, **rec})
        if missing:
            print(f"TAP discovery for bands {missing} ...", flush=True)
            for e in tap_epochs(ra, dec, missing, args.per_band):
                print(f"measuring tap band {e['band']} mjd={e['mjd']} ...", flush=True)
                rec = await measure(e["url"], ra, dec, tmp)
                points.append({**e, **rec})
    good = [p for p in points if p["flux"] is not None]
    return {"target": args.target or name, "ra": ra, "dec": dec,
            "n_points": len(good), "n_attempted": len(points), "points": points}


async def main_tracked(args, bands: list[int]) -> dict:
    """Horizons-tracked extraction (Direction A prototype).

    For each sample MJD, resolves the target's geocentric position via
    Horizons, TAP-discovers cutouts covering THAT position per band, and
    measures at the tracked coordinates. Points carry mode=tap-tracked.
    """
    from backend.horizons import positions as horizons_positions
    sc = load_showcase(args.target) if args.target else None
    if args.mjds:
        sample = [float(x) for x in args.mjds.split(",")]
    elif sc:
        sample = sorted({e["mjd"] for e in sc.get("epochs", []) if e.get("mjd")})
    else:
        raise SystemExit("tracked mode needs --mjds or a --target bundle")
    sky = horizons_positions(args.tracked, sample)
    name = (sc.get("title", args.target) if sc else args.tracked) + " (Horizons-tracked)"
    points: list[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for b in bands:
            for mjd, (ra, dec) in zip(sample, sky):
                try:
                    found = discover_epochs(ra, dec, band=b)
                except Exception as ex:  # noqa: BLE001 - TAP flakes recorded per band
                    print(f"  band {b} mjd={mjd}: TAP failed ({ex})", flush=True)
                    continue
                for f in (found or [])[:args.per_band]:
                    print(f"measuring tracked band {b} mjd={f.get('mjd')} ...", flush=True)
                    rec = await measure(f.get("cutout_url", ""), ra, dec, tmp)
                    points.append({"band": b, "mjd": f.get("mjd", mjd),
                                   "url": f.get("cutout_url", ""),
                                   "label": f.get("label", ""), "source": "tap-tracked",
                                   "track_ra": ra, "track_dec": dec, **rec})
    good = [p for p in points if p["flux"] is not None]
    return {"target": name, "mode": "horizons-tracked",
            "horizons_target": args.tracked, "sample_mjds": sample,
            "n_points": len(good), "n_attempted": len(points), "points": points}


def plot(result: dict, out_png: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    good = [p for p in result["points"]
            if p["flux"] is not None and p["wavelength_um"]]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    if good:
        xs = [p["wavelength_um"] for p in good]
        ys = [p["flux"] for p in good]
        es = [p["flux_err"] or 0 for p in good]
        cs = [f"C{p['band'] % 10}" for p in good]
        ax.errorbar(xs, ys, yerr=es, fmt="o", ecolor="white",
                    markerfacecolor="none", markeredgecolor="white")
        sc = ax.scatter(xs, ys, c=[p["band"] for p in good], cmap="viridis", zorder=3)
        for x, y, p in zip(xs, ys, good):
            ax.annotate(f"B{p['band']}", (x, y), fontsize=7, color="0.8")
        fig.colorbar(sc, ax=ax, label="detector band")
    ax.set_xlabel("wavelength (µm)")
    ax.set_ylabel("aperture flux")
    ax.set_title(f"{result['target']}: observed slope across arrays ({len(good)} points)")
    ax.set_facecolor("#04050a")
    fig.patch.set_facecolor("#04050a")
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    print(f"plot -> {out_png}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="3i-atlas")
    ap.add_argument("--ra", type=float, default=None)
    ap.add_argument("--dec", type=float, default=None)
    ap.add_argument("--bands", default="1,2,3,4,5,6")
    ap.add_argument("--per-band", type=int, default=3)
    ap.add_argument("--no-plot", action="store_true")
    ap.add_argument("--tracked", default=None,
                    help="Horizons target name for moving-target extraction (e.g. 3I)")
    ap.add_argument("--mjds", default=None,
                    help="comma-separated sample MJDs for tracked mode")
    args = ap.parse_args()
    result = asyncio.run(main_async(args))
    DATA.mkdir(exist_ok=True)
    tag = args.target or f"{args.ra}_{args.dec}"
    if getattr(args, "tracked", None):
        tag += "-tracked"
    out_json = DATA / f"track_{tag}.json"
    out_json.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_json}: {result['n_points']}/{result['n_attempted']} measured")
    if not args.no_plot:
        plot(result, DATA / f"track_{tag}.png")


if __name__ == "__main__":
    main()
