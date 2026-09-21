# SpectraHunt Architecture (v1)

Public blink comparator for the SPHEREx sky: **same sky, different time.**

## 1. Layer contract (the one rule)

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
  └─ browser: static export only (+ localStorage for SkyBoT). No science calls at load.
```

Dev-live mode (`DATA_MODE=live` + API URL) may proxy IRSA through FastAPI; the proxy is
itself write-through cached. Production has no server. `png:null` is a valid state
(metadata + "cutout pending"); unmeasured sky renders dark ("not yet surveyed").

## 2. What each view shall do

* **Home `#/`** — Full-viewport clickable canvas sky (twinkle, nebula wash, orbiting demo
  pair once PNGs land), spectrum-ring search (showcases, coordinates, notable fields,
  `/` shortcut, full keyboard), Try-chips, coverage toggle pill, real stats bar
  (cells surveyed · showcases live), how-it-works (align → subtract → catalog) with CTA.
  Clicking empty sky opens the inspector; scrolling dismisses it.
* **Sky `#/sky`** — Equirectangular coverage canvas: measured tiles in epoch blues,
  unmeasured dark; graticule + labels; hover readout (RA/Dec/epochs, hidden on touch);
  tools (compact search, coverage switch, help); legend; inspector rail (desktop) /
  bottom sheet (mobile) with epochs/bands/survey/status + blink entry (enabled only near
  a blinkable showcase). Footer hidden — fullscreen page.
* **Blink `#/blink/<id>`** — Player: autoplay transport, 150–1200ms speed, step,
  difference mode (current vs previous frame), 6-band row, epoch chips, keyboard
  (Space/←/→, ignored in inputs), 10′ scale bar, epoch tags; PNG layers when cached.
  Aside: story, metadata (RA/Dec/epochs/band/scale), epoch list, SkyBoT cross-match
  (live API or showcase notes), provenance links + QR2 cite box. Back → sky.
* **Candidates `#/candidates`** — Cards from showcases/census with real PNG thumbs
  (static pending tile otherwise), known (green) / unidentified (amber) badges,
  σ scores, band + date, all/unknown/known filters with counts. Click → blink.
* **About `#/about`** — Mission, LVF same-band rule, band table, method, live-data
  notice, citation block, sources (IRSA, QR overview, AWS Open Data, SkyBoT).

Global: hash router with `#how` deep-link, per-view titles, skip-link, focus management,
hamburger nav ≤640px, `prefers-reduced-motion` freezes all animation, touch targets ≥44px.

## 3. Backend (dev-only; never on the CDN)

`app.py`: `/health /api/showcases /api/showcase/{id} /api/epochs /api/cutout.png
/api/resolve /api/skybot /api/citation` — read-only, graceful 404s, never 500.
`epochs.py`: TAP first (daemon-thread 60s bound — a hung query can never wedge the
process), SIA2 fallback, returns `[]` when IRSA is unreachable.
`cutouts.py`: lazy astropy — parse IMAGE/FLAGS/VARIANCE/WCS-WAVE, median-fill mask,
zscale+asinh PNG; `wavelengths_match()` enforces the LVF gate.
`crossmatch.py`: SkyBoT (exposure MJD, float-rounded cache keys), Sesame, Horizons.
`cache.py`: SQLite scratch, WAL, status KV + SkyBoT table.

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

`pytest backend/tests/ -q` (gate, schema, cache, API) · `npx eslint src` (0 errors) ·
`npm run build` (exports `out/showcases/*.json`) · bundle <10MB · each showcase <2s
offline · keyboard-only pass · 360px pass.

## 7. Roadmap

M1 ✅ scaffold + transport + canvas map. M2 ✅ fallbacks deleted, TAP bounded.
M3 (now): all 6 showcase PNGs + 3 tally cells → rebuild → push.
M4: ecliptic census (~864 cells) → real surveyed belt on hero; per-band PNG rows.
M5: weekly Action live; full-sky convergence meter (`x/2592 cells surveyed` — itself real).
