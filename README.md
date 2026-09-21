# SpectraHunt

**NASA Space Apps Challenge 2026 · Advanced · Astrophysics / Planets & Moons / Software**

> Since 2025, NASA's SPHEREx mission maps the entire sky every six months in 102 bands
> of near-infrared light. Comets, asteroids, stars, brown dwarfs — and maybe new planets —
> reveal themselves by shifting between visits. No one person can sift a billion objects alone.
> SpectraHunt is the public front door: search any object or sky position, then blink
> between SPHEREx epochs to see what changed.

**Live rule:** every pixel, number, and field on the site traces to IRSA data or a local
cache of it. See `ARCHITECTURE.md` §1 for the layer contract.

## What the site does

| View | Route | Job |
|---|---|---|
| Home | `#/` | Hero sky (clickable canvas), object/coordinate search, showcase chips, live stats, how-it-works |
| Sky map | `#/sky` | Equirectangular coverage canvas (tiles = measured TAP tallies, dark = unmeasured), hover readout, click inspector with epochs/bands/survey + blink entry |
| Blink | `#/blink/<id>?band=&epoch=&mode=` | Canvas epoch comparator: timeline slider with date ticks, autoplay transport + speed + step, **blink / side-by-side / swipe / difference** modes (synced pan/zoom), motion-color composite, stretch (linear/log/sqrt/asinh) + black/white + presets + invert + colormaps (cividis default), 6 detectors × 102 channels, RGB picker, click-for-spectrum, PNG/WebM export, metadata + motion + light curve + SkyBoT/MPC/Horizons/SIMBAD + provenance aside |
| Candidates | `#/candidates` | Showcase-derived cards with real PNG thumbs (or honest pending tile), known/unknown badges, σ scores, measured motion ″/day, all/unknown/known filters, CSV/JSON export |
| About | `#/about` | Mission, LVF same-band rule, band table, detection method, QR2 citation, sources |

Three clicks to first blink: Home → chip → drag. Works offline once built; works on a phone.

## Quick start

```bash
cd spectrahunt-web && npm install && npm run dev   # http://localhost:3000
```

Optional live dev API (real-time TAP/IBE proxy instead of the static bundle):

```bash
pip install -r requirements.txt
python -m backend                                  # :8000/health
cd spectrahunt-web
NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Fill showcase pixels (weekly/manual, never on the CDN — bounded, resumable, offline-safe):

```bash
python scripts/build_showcases.py --only 3i-atlas   # TAP → IBE cutout → zscale PNG
python scripts/real_coverage.py                     # per-cell tallies → public/coverage.json
cd spectrahunt-web && npm run build
```

## Repository

```
backend/            # dev-only FastAPI: epoch discovery, cutout proxy, resolve, SkyBoT, detect
  app.py            # /health /api/showcases /api/showcase/{id} /api/epochs
                    # /api/cutout.png /api/resolve /api/skybot /api/citation /api/detect
  epochs.py         # TAP first (daemon-thread bounded), SIA2 fallback, never raises
  cutouts.py        # lazy astropy: parse/mask/render, LVF wavelength gate
  crossmatch.py     # SkyBoT / Sesame / Horizons, SQLite-cached
  detect.py         # source extraction (SEP→photutils→scipy→numpy) + cross-epoch matching
  cache.py          # git-ignored scratch (WAL)
scripts/
  build_showcases.py  # showcase PNG indexer (oldest+newest pairing for same-spot epochs)
  real_coverage.py    # showcase-cell tallies → coverage.json
spectrahunt-web/
  public/showcases/   # 9 fields (3i-atlas, ecliptic-mover, nep-deep, orion, galcenter,
                        # m31, lmc, virgo, eros — real coords/epochs, png fills in via indexer)
  public/cutouts/     # rendered PNGs, ≤100KB, immutable cache
  public/coverage.json# measured cells {epochs, images, bands, span}
  src/lib/astro.ts    # coordinates, 88 constellations, 102 channels, stretch/colormaps, permalinks
  src/lib/catalogs.ts # Sesame resolve, SkyBoT/MPC/Horizons/SIMBAD links, tours, glossary
  src/                # Home, Blink, Sky, Candidates, About + canvas engine + store
ARCHITECTURE.md       # full system plan, contracts, workflows, roadmap
DEMO.md               # 90-second walkthrough script
LICENSE               # MIT + required SPHEREx/IRSA attribution
```

## Data & science rules

* **Source:** SPHEREx Quick Release 2 via IRSA (DOI `10.26131/IRSA652`). TAP
  `spherex.artifact ⋈ spherex.plane` first (no lag), SIA2 fallback (~1d lag), IBE
  cutouts `?center=RA,Dec&size=deg`, S3 bulk only.
* **LVF rule:** SPHEREx's linear variable filters mean one pixel sees different wavelengths
  per pointing — we blink **same-band epochs only** (|Δλ| < ½ bandwidth), enforced at index time.
* **Cross-match:** SkyBoT cone at exposure MJD (cached 30d), MPC checker, Sesame/SIMBAD,
  Horizons on demand. Never blocks the blink.
* **Honesty:** `png:null` renders metadata + "cutout pending"; unmeasured sky renders dark;
  unknown fields say "not yet surveyed". Nothing is fabricated.

## Checks

```bash
.venv/bin/python -m pytest backend/tests/ -q   # 9 passed
cd spectrahunt-web && npx eslint src            # 0 errors
cd spectrahunt-web && npm run build             # static export to out/
```

Bundle budget <10MB (PNG+JSON). Weekly refresh via `.github/workflows/refresh.yml`.

> This publication makes use of data products from SPHEREx (JPL/Caltech, NASA).
