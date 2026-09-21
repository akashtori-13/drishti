# SpectraHunt v2 — blink-first architecture (chief-dev decision)

Goal (Space Apps 2026, Advanced): public web tool to display SPHEREx sky images
so anyone can see how they change over time. Pixels first, ML second.

## Research (Sep 2026)

* SPHEREx QR2 current (`10.26131/IRSA652`), QR1 retired, QR3 due Sep 2026. Weekly.
  MEF: IMAGE/FLAGS/VARIANCE/ZODI/PSF/WCS-WAVE. 6.2"/px.
* Access: TAP `spherex.artifact⋈spherex.plane` (immediate) > SIA2 `COLLECTION=spherex_qr2[_deep|_cal]`
  (~1d lag). IBE cutout `?center=RA,Dec&size=deg`. S3 `nasa-irsa-spherex/qr2/level2` (unsigned).
* Existing: `spherex-pipelines`, `spexpi`, `spxquery`, Source Discovery Tool
  (SExtractor+Firefly+bokeh), IRSA Data Explorer, Firefly API, Aladin Lite v3
  (HiPS/FITS overlays, powers ESA Sky). ZTF `findStreaks` proves reference-diff pattern.
* Demo gold: 3I/ATLAS Aug 2025 (72 ptgs, CO2 coma 3') vs Dec 2025 (104 ptgs, H2O 40x,
  organics, tail). Table: `.../comet3iatlas/obscore_3I_Atlas.vot`.

## Decision

```
TAP/SIA2/S3 → scripts/build_showcases.py (weekly, offline-safe)
  → spectrahunt-web/public/showcases/*.json + public/cutouts/*.png (<5MB committed)
  → Next.js static export: Aladin Lite (context) + BlinkComparator (story)
  → optional /api/cutout proxy (live IBE, 30d cache). No FITS mirrored.
Cross-match client-side: SkyBoT + MPC + Sesame, localStorage cached.
```

* Same-band blink only (LVF): `energy_bandpassname` D1-D6 + `|Δλ|` badge.
* Collection param everywhere → QR3 = one-line switch.
* Dropped: server SEP detection on CDN, Leaflet sky, 72x36 grid as primary.

## Layout

* `spectrahunt-web/public/showcases/3i-atlas.json` — real obs_ids/coords/MJDs from vot.
* `src/components/BlinkComparator.tsx` — slider/onion/diff + autoplay.
* `src/components/AladinSky.tsx` — Aladin Lite v3 CDN, DSS2 + marker, graceful offline.
* `src/components/BlinkPage.tsx` — `#/blink` view.
* `scripts/build_showcases.py` — TAP→IBE→PNG filler (png=null until run).

## Run

```bash
python scripts/build_showcases.py --only 3i-atlas
cp data/*.json spectrahunt-web/public/data/
cd spectrahunt-web && npm ci && npm run build
python -m pytest backend/tests/ -q
```
