#!/usr/bin/env python3
"""
v2 showcase indexer: TAP-discovery -> IBE cutout -> PNG.

Reads data/showcases/*.json (or public/showcases), and for each epoch with
png=null, discovers the newest covering image via IRSA TAP
(spherex.artifact + spherex.plane, same bandpass), fetches a small IBE
cutout, renders zscale PNG to spectrahunt-web/public/cutouts/.

Offline-safe: failures leave png=null (UI shows story + Aladin context).
Usage: python scripts/build_showcases.py [--only 3i-atlas]
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

TAP_URL = "https://irsa.ipac.caltech.edu/TAP"


def discover_cutout_url(ra: float, dec: float, bandpass: str, size_deg: float = 0.05,
                        timeout_s: int = 60):
    import pyvo
    import requests
    sess = requests.Session()
    sess.headers.update({"User-Agent": "SpectraHunt/1.0"})
    svc = pyvo.dal.TAPService(TAP_URL, session=sess)
    # NOTE: bandpass like 'SPHEREx-D3'
    q = (
        "SELECT TOP 1 'https://irsa.ipac.caltech.edu/' || a.uri AS base_uri, p.time_bounds_lower "
        "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
        f"WHERE 1 = CONTAINS(POINT('ICRS', {ra}, {dec}), p.poly) "
        f"AND p.energy_bandpassname = '{bandpass}' "
        "ORDER BY p.time_bounds_lower DESC"
    )
    res = svc.search(q, maxrec=1)
    if len(res) == 0:
        return None
    row = res[0]
    try:
        base = str(row["base_uri"])
    except Exception:
        base = str(row[0])
    return f"{base}?center={ra},{dec}&size={size_deg}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--size", type=float, default=0.05,
                    help="Cutout size in deg (0.05 = 3 arcmin, fast; 0.1 = 6 arcmin)")
    ap.add_argument("--timeout", type=int, default=60,
                    help="Per-epoch budget in seconds; indexer never blocks builds")
    args = ap.parse_args()

    from backend.cutouts import parse_cutout_fits, mask_bad_pixels, render_png
    import asyncio

    async def fetch_one(url: str):
        import httpx
        from backend.config import USER_AGENT
        async with httpx.AsyncClient(timeout=args.timeout) as c:
            r = await c.get(url, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            return r.content

    pub = ROOT / "spectrahunt-web" / "public" / "showcases"
    out_img = ROOT / "spectrahunt-web" / "public" / "cutouts"
    out_img.mkdir(parents=True, exist_ok=True)

    files = sorted(pub.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    for f in files:
        doc = json.loads(f.read_text())
        changed = False
        bandpass_default = doc.get("tap", {}).get("bandpass", "SPHEREx-D3")
        for ep in doc.get("epochs", []):
            if ep.get("png"):
                continue
            ra = ep.get("ra", doc["ra"])
            dec = ep.get("dec", doc["dec"])
            size = min(ep.get("size_deg", args.size), args.size)
            try:
                print(f"[{doc['id']}] {ep.get('label')} TAP+IBE…", flush=True)
                url = discover_cutout_url(ra, dec, bandpass_default, size)
                if not url:
                    print(f"[{doc['id']}] no TAP image for {ra},{dec} {bandpass_default}")
                    continue
                content = asyncio.run(fetch_one(url))
                tmp = out_img / f"_{doc['id']}_tmp.fits"
                tmp.write_bytes(content)
                parsed = parse_cutout_fits(tmp)
                tmp.unlink(missing_ok=True)
                if parsed["image"] is None:
                    print(f"[{doc['id']}] empty IMAGE hdu")
                    continue
                masked, _ = mask_bad_pixels(parsed["image"], parsed.get("flags"), parsed.get("variance"))
                png_path = out_img / f"{doc['id']}_{ep.get('label','epoch').split('·')[0].strip().replace(' ','-')}.png"
                if render_png(masked, png_path):
                    ep["png"] = f"/cutouts/{png_path.name}"
                    ep["cutout_url"] = url
                    changed = True
                    print(f"[{doc['id']}] wrote {png_path.name}")
            except Exception as e:
                print(f"[{doc['id']}] epoch {ep.get('label')} failed: {e}")
        if changed:
            f.write_text(json.dumps(doc, indent=2))
            # mirror to data/showcases for reference
            ref = ROOT / "data" / "showcases" / f.name
            ref.parent.mkdir(parents=True, exist_ok=True)
            ref.write_text(json.dumps(doc, indent=2))
    return True


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
