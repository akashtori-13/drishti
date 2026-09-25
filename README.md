# STELLAR — hunt what moves in the infrared sky

**STELLAR** (SPHEREx Transient Explorer & Light-spectrum Large-scale Archival
Repository) is a public blink comparator for NASA's SPHEREx sky, built by
**Team AKASHTORI** for the NASA Space Apps Challenge 2026. Pick any patch of
sky, blink its repeated visits, and see what changed — comets, asteroids,
variable stars. No login, no background needed. Web, Android, Linux, Windows.

- Live app: serve `spectrahunt-web/out` (static export) · API: FastAPI dev proxy
- Releases: signed Android APK, Linux `.deb` + AppImage, Windows `-setup.exe`

## How deep the data goes

Every pixel and every number traces to a real archive. Nothing is simulated,
and anything unmeasured renders as missing — never guessed.

| Layer | Source | What we take |
|---|---|---|
| Infrared epochs | **SPHEREx Quick Release 2, NASA/IPAC IRSA** (TAP `spherex.*`, SIA2, IBE cutouts; DOI `10.26131/IRSA652`) | every cutout pixel, epoch count, MJD, band |
| Sky context | **CDS Strasbourg** HiPS (DSS2 + 2MASS), hips2fits CAR/SIN | base imagery, all-sky map |
| Stars | **ESA Gaia DR3** (`gaiadr3.gaia_source`) | cross-matches, observer overlays, G magnitudes |
| Names | **SIMBAD / Sesame** (CDS) | object resolution from typed queries |
| Movers | **IMCCE SkyBoT**, MPC, **JPL Horizons** | solar-system cross-checks at each exposure MJD |
| Orbits | **CelesTrak** TLEs | SPHEREx orbit elements |
| Bright stars | **Yale Bright Star Catalog v5** (via d3-celestial, vendored) | 1,627-star all-sky map layer |
| Figures | Standard constellation lines (vendored GeoJSON) | 89 asterism figures |
| Nebulae | Messier/NGC catalog positions | glow placement (rendering is artistic, positions are not) |

The physics is enforced, not assumed: SPHEREx uses linear variable filters,
so the same detector pixel sees a different wavelength depending on sky
position — **we only compare epochs whose wavelengths agree within half the
local bandwidth** (`cutouts.py: wavelengths_match`). Ground truth first:
field centers land sub-arcminute on M31, Crab, LMC, SMC, Orion, Omega Cen,
M51, M101, Sgr A*; 3I/ATLAS matches the published SPHEREx characterization.

## What the app does with it

- **Blink workspace** — blink, side-by-side, swipe, true difference (B−A),
  motion-color, and false-color modes over aligned epochs; WCS-aligned
  difference detection with dipole significance; aperture light curves (MJD)
  and six-band spectra (µm); in-browser measuring; CSV/JSON/PNG/WebM export.
- **Observer SkyMap** — ground POV from any lat/lon at any time: real HiPS
  tiles, constellation figures, Gaia stars, computed Sun + Moon phase,
  Gaia/SkyBoT overlays, click-to-inspect any point.
- **Featured fields** — 20 curated, pipeline-measured fields (143 epochs,
  240 cutouts) with dipole significance, light curves, per-object MOVER /
  VARIABLE tables, and one-click jumps into the blink workspace.
- **Coverage map** — 2,590-cell measured census of what the archive holds.
- **Offline-first** — static export + layered caches (localStorage →
  IndexedDB → SQLite TTLs); stale beats missing; an 8 MB Android build serves
  places where bandwidth is scarce.

## Repo map

- `spectrahunt-web/` — Next.js 16 static-export frontend (`src/`, `public/`)
- `backend/` — FastAPI dev proxy + pipeline (`cutouts.py`, `detect.py`,
  `photometry.py`, `epochs.py`, `crossmatch.py`, `pipeline.py`, `tests/`)
- `desktop/src-tauri/` — Tauri shell (Linux/Windows)
- `spectrahunt-web/android/` — Capacitor Android shell
- `scripts/release.py` — one-command local ship (web + APK + desktop)
- `docs/` — API, pipeline, frontend, ops, classroom guides

## Verify it yourself

```bash
make check      # backend tests + frontend tests + tsc + eslint + web build
```

Key honesty tests live in `backend/tests/`; frontend math (coordinates,
stretch, colormaps) is unit-tested in `spectrahunt-web/src/lib/*.test.ts`;
every measurement the UI shows carries units and uncertainties.
