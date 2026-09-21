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
| Home | `/` | Real-sky hero (clickable mini-map with field markers), object/coordinate search, Try chips + dice, featured-detection carousel, field rail, numbers band, how-it-works |
| Sky map | `/sky` | Observer view (real HiPS sky, GPS, clock, figures, Gaia stars) + all-sky coverage map toggle; hover readout, inspector with blink entry (static or live on-demand) |
| Blink | `/blink/<id>?band=&epoch=&mode=` (live: `/blink/live?ra=&dec=&band=`) | Square stage + side control column (View/Display/Bands/Measure) + data rail; autoplay transport, timeline + filmstrip, blink/side/swipe/diff/motion-color/true-RGB, stretch + colormaps (grayscale default), 102 channels, in-browser ±5σ detection, click spectrum, PNG/WebM/figure export, ⌘K palette |
| Candidates | `/candidates` | Measured cards (Known/Mover/Variable/Unidentified from pipeline reports — never invented), significance + baseline stats, filters with counts, CSV/JSON export |
| About | `/about` | Mission, LVF same-band rule, band table, tours, glossary, shortcuts, method, live-data notice, citation, multi-agency sources |

Three clicks to first blink: Home → chip → drag. Works offline once built; works on a phone.

## Docs (for collaborators)

| Doc | What |
|---|---|
| `SYSTEM_DESIGN.md` | Whole design: context, containers, components, data, runtime, failures, decisions, roadmap |
| `ARCHITECTURE.md` | Short contracts: layer rule, views, backend, data shapes, workflows |
| `CONTRIBUTING.md` | Setup, workflow, conventions, PR checklist, ops |
| `docs/API.md` | Every endpoint: params, shapes, curl examples, caching, failure semantics |
| `docs/FRONTEND.md` | Routes, state, sky engines, blink workspace, libs, contributor conventions |
| `docs/PIPELINE.md` | Backend modules, scripts, caches, refresh ops, failure playbook, adding fields |
| `docs/TROUBLESHOOTING.md` | Symptom-first fixes + live upstream status table |
| `DEMO.md` | 90-second walkthrough script |

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
python scripts/sky_census.py --shard 0/4 --progress data/census_shard_0.json &  # + shards 1..3
python scripts/sky_census.py --merge                          # shards → public/coverage.json
python scripts/build_showcases.py --only 3i-atlas             # TAP → IBE cutout → zscale PNG
cd spectrahunt-web && npm run build
```

## Repository

```
backend/            # FastAPI: epoch discovery, cutout proxy, resolve, SkyBoT, detect
  app.py            # /health /api/showcases /api/showcase/{id} /api/epochs
                    # /api/cutout.png /api/frame.png /api/frames /api/resolve /api/skybot
                    # /api/stars /api/detect /api/lightcurve /api/spectrum /api/citation
  epochs.py         # TAP first (daemon-thread bounded), SIA2 fallback, newest-first, never raises
  cutouts.py        # lazy astropy: parse/mask/render, LVF wavelength gate
  align.py          # WCS reproject B→A, FFT phase-correlation fallback, sky→pixel
  photometry.py     # aperture photometry, significance maps, dipole mover/variable finder
  pipeline.py       # orchestration + TTL caches; detect/lightcurve/spectrum/field_report
  crossmatch.py     # SkyBoT / SIMBAD-first+Sesame / Horizons / Gaia DR3, cached
  detect.py         # fast peak-finder path (SEP→photutils→scipy→numpy)
  cache.py          # git-ignored scratch (WAL): kv, SkyBoT, api_cache TTL
scripts/
  build_showcases.py  # showcase PNG indexer (oldest+newest pairing, sibling-frame fallback)
  build_bandstack.py  # per-detector newest-visit PNGs (powers RGB + spectra)
  fetch_compare.py    # DSS2 + 2MASS context cutouts per field (CDS hips2fits)
  nep_stack.py        # median deep-stack of NEP visits → bonus epoch
  classify_fields.py  # detection + light curves → public/reports/{id}.json
  sky_census.py       # all-sky obscore census (sharded, resumable, mergable)
  process_field.py    # one position → full JSON report
  nightly.sh          # overnight loop: merge → fill → build → verify → commit
  watch_push.sh       # commit + push whenever processed data lands
  audit_loop.sh       # 50-pass verify loop (tests, types, lint, routes, data)
  serve.py            # static server with no-store HTML (auto hard-refresh)
spectrahunt-web/
  public/showcases/   # 20 fields (3i-atlas, ecliptic-mover, nep-deep, orion,
                        # galcenter, m31, lmc, virgo, eros, crab, omega-cen,
                        # carina, m51, m101, smc, dorado, draco, ophiuchus,
                        # libra, hercules — real coords/epochs, png via indexer)
  public/cutouts/     # rendered PNGs, ≤100KB, immutable cache
  public/compare/     # DSS2 + 2MASS context JPGs per field
  public/reports/     # measured classifications per field (movers/σ/curves)
  public/coverage.json# measured cells {epochs, images, bands, span}
  public/data/        # vendored constellation lines (offline-safe)
  src/lib/astro.ts    # coordinates, 88 constellations, 102 channels, stretch/colormaps, permalinks
  src/lib/catalogs.ts # SIMBAD-first resolve, catalog links, tours, glossary, surprise
  src/lib/skycache.ts # IndexedDB imagery + neighbor prefetch + JSON LRU
  src/lib/motion.ts   # in-browser ±5σ dipole detection
  src/                # pages + viewers (HeroSky, StellariumView, Blink deck, rail) + store
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
.venv/bin/python -m pytest backend/tests/ -q   # 16 passed
cd spectrahunt-web && npx eslint src            # 0 errors
cd spectrahunt-web && npm run build             # static export to out/
```

Bundle budget <10MB (PNG+JSON). Weekly refresh via `.github/workflows/refresh.yml`.

> This publication makes use of data products from SPHEREx (JPL/Caltech, NASA).
