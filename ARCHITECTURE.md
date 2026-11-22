# DRISHTI Architecture (v2)

Public blink comparator for the SPHEREx sky: **same sky, different time.**

## 1. Layer contract (the one rule)

Cache-first, everywhere: serve what's on the device immediately, revalidate
behind, never block the UI on an upstream. Stale beats missing; missing
renders honestly. Concretely: browser localStorage (showcases, coverage, star
views) → IndexedDB (imagery) → SQLite TTLs (discovery 1 h, products 6 h,
catalogs 30 d) → stale-serving fallbacks on outage → graceful `detail`
strings. Only a cold, offline device with an empty cache ever sees a loading
state it can't skip.

```
IRSA TAP / SIA2 / IBE / S3          ← L0 origin, source of truth
  │
  ├─ scripts (manual/weekly, bounded, resumable, offline-safe)
  │    TAP discover → IBE cutout → mask → zscale PNG
  │    per-cell tallies (images/epochs/bands/span)
  │         │
  │         ▼
  │    PC cache data/ (git-ignored: tap/, fits/, png/, census/, manifest)
  │         │  promote (budget-gated, <10MB)
  │         ▼
  ├─ public/ bundle (committed: showcases/*.json, cutouts/*.png, coverage.json)
  │         │
  │         ▼
  └─ browser: static export only (+ localStorage for flags/tutorial).
       Direct browser→Sesame resolve (CORS-open) for names; no science calls at load.
```

Dev-live mode (`DATA_MODE=live` + API URL) may proxy IRSA through FastAPI, including
`/api/detect`; the proxy is itself write-through cached. Production has no server.
`png:null` is a valid state (metadata + "cutout pending"); unmeasured sky renders
dark ("not yet surveyed").

## 2. What each view shall do

* **Home `/`** — Full-viewport clickable canvas sky over the real 2MASS CAR
  background (mirrored to overlay math): clickable blink-field markers (the bg
  is a mini-map), spectrum-ring search (showcases, decimal + sexagesimal
  coordinates, 88 constellations, SIMBAD/Sesame names, `/` shortcut, full
  keyboard), Surprise-me dice chip, Try-chips, coverage toggle pill, real stats
  bar (cells surveyed · showcases live), how-it-works (align → subtract →
  catalog) with CTA, first-visit 4-step tutorial. Clicking empty sky opens the
  inspector; scrolling dismisses it.
* **Sky `/sky`** — Observer view by default (Stellarium POV: real HiPS SIN sky
  for your location + live clock, drag-look, zoom, constellation figures, Gaia
  stars, Sun/Moon, Alt/Az readout, GPS locate, ±1 h time steps), with an
  all-sky-map mode: equirectangular coverage canvas over the same real
  background (measured tiles in epoch blues, unmeasured dark; graticule +
  labels; hover readout; legend; compass + FOV pills); inspector rail (desktop)
  / bottom sheet (mobile) with epochs/bands/survey/status + blink entry —
  static showcases nearby, or **live on-demand blink for any visited field**
  (`/blink/live?ra=&dec=&band=`). Footer hidden — fullscreen page.
* **Blink `/blink/<id>?band=&epoch=&mode=`** — Sandwich layout, no page scroll
  on desktop: square stage (badges only) center, tweak column left, info rail
  right. Toolbar under the image (segmented Blink/Side/Swipe/Diff/Color +
  Display/Measure tool buttons + contextual gain/curtain); timeline transport
  + filmstrip below; Display/Bands/Measure open as smart popovers (flip
  above/below by viewport space, never over pixels). Left rail: View, Display
  (stretch, colormap, invert, presets, black/white), Bands (6 detectors × 102
  channels + true RGB false-color from per-band cutouts), Measure (cursor
  probe, histogram, diff stats, ≥5σ dipole list). Canvas engine: synced
  pan/zoom, progressive preload, in-browser motion detection, click spectrum,
  PNG/WebM/figure export, ⌘K palette, keyboard (Space/←/→). Data rail tabs
  (Overview/Epochs/Catalogs/Share) with measured verdicts, real light curves,
  multi-survey context (DSS2/2MASS), provenance + citation.
* **Candidates `/candidates`** — Cards from all showcases with real PNG thumbs
  (honest pending tile otherwise), measured kinds (Known / Mover / Variable /
  Unidentified, from pipeline reports — never invented), top-σ + baseline stats,
  all/unknown/known filters with counts, CSV/JSON export. Click → real blink page.
* **About `/about`** — Mission, LVF same-band rule, band table, method, live-data
  notice, citation block, sources (IRSA, QR overview, AWS Open Data, SkyBoT).

Global: real multipage routes with per-page titles; dynamic-island pill navbar
(command bar with context + search overlay + mobile sheet); `blinkURL()`
permalinks; skip-link, focus management, touch targets ≥44px,
`prefers-reduced-motion` freezes all animation.

## 3. Backend (dev-only; never on the CDN)

`app.py`: `/health /api/showcases /api/showcase/{id} /api/epochs /api/cutout.png
/api/frame.png /api/frames /api/resolve /api/skybot /api/stars /api/detect
/api/lightcurve /api/spectrum /api/citation` — read-only, graceful 404s, never 500.
`epochs.py`: TAP first (daemon-thread bound), SIA2 fallback, `newest` ordering,
`limit` caps; returns `[]` when IRSA is unreachable.
`cutouts.py`: lazy astropy — parse IMAGE/FLAGS/VARIANCE/WCS-WAVE, aperture exclusion (never median-filled), area correction + `core_masked`,
zscale+asinh PNG; `wavelengths_match()` enforces the LVF gate.
`align.py`: WCS `reproject_interp` of B onto A's grid; FFT phase-correlation
fallback; `sky_to_pixel` with array-center fallback.
`photometry.py`: circular aperture + annulus background with variance-aware
errors; MAD/variance significance maps; dipole pairing (mover = adjacent +/−
pair above threshold, else variable) with per-epoch fluxes.
`pipeline.py`: orchestration with TTL caches (discovery 1 h, products 6 h);
`detect_field` (awaited, never `asyncio.run` in request scope), `lightcurve_for`
(≤5 sampled epochs), `spectrum_for` (newest of all 6 bands), `field_report`.
`crossmatch.py`: SkyBoT (exposure MJD, float-rounded cache keys), SIMBAD-ASCII
first + Sesame fallback resolve, Horizons on demand, Gaia DR3 cone + per-view
cone (30 d cache).
`cache.py`: SQLite scratch, WAL, status KV + SkyBoT table + `api_cache` TTL table.

## 4. Data contracts

* `showcases/{id}.json`: `{id,title,ra,dec,story,epochs[{label,name?,obs_id?,band?,
  wavelength_um?,mjd?,png?,cutout_url?,note?,skybot_match?}],tap{collection,bandpass},
  links,citation}`. Same-spot pairs store oldest (epoch A) + newest (epoch B) visits.
* `coverage.json`: `{grid:{w:72,h:36},cells:{"i,j":{showcase,images,images_capped,
  epochs,bands,span_mjd,per_band}},generated_at,source}`. Passes split on >20d gaps;
  deep fields reported as continuous stare (images+span).
* `cutouts/*.png`: 512px max, ≤100KB, `immutable` cache, URL-hash or `{id}-{epoch}` names.

## 5. Workflows

1. **Author showcase** → JSON with `png:null` → `build_showcases.py --only <id>` → verify
   stretch stats → commit JSON+PNG.
2. **Survey sky** → `real_coverage.py` (resumable frontier: showcases → ecliptic → deep
   → full sky) → tiles + inspector go real cell by cell.
3. **Weekly refresh** → rerun both → `npm run build` → push (CDN auto; GH Action defined).
4. **Judge offline** → everything renders from the bundle; Aladin-free by design.

## 6. Testing & budgets

`pytest backend/tests/ -q` (detection, motion, gate, schema, cache, API) ·
`npx eslint src` (0 errors) · `npm run build` (exports `out/showcases/*.json`) ·
bundle <10MB · each showcase <2s offline · keyboard-only pass · 360px pass.

## 7. Roadmap

M1 <img src="assets/icons/check.svg" alt="done" width="14"> scaffold + transport + canvas map. M2 <img src="assets/icons/check.svg" alt="done" width="14"> fallbacks deleted, TAP bounded.
M3 <img src="assets/icons/check.svg" alt="done" width="14"> full viewer (modes/diff/stretch/RGB/spectrum), search (sexagesimal/constellations/Sesame/surprise),
permalinks, export, tutorial/tours/glossary, `/api/detect`, real ecliptic PNGs.
M4: ecliptic census (~864 cells) → real surveyed belt on hero; per-band PNG rows.
M5: weekly Action live; full-sky convergence meter (`x/2592 cells surveyed` — itself real; 72×36 slots, 2 polar cells empty).
