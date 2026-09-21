# SpectraHunt Architecture (v1)

Public blink comparator for SPHEREx: same sky, different time.

```
IRSA TAP / SIA2 / IBE / S3
  │
  ├─ scripts/build_showcases.py (manual/weekly, timeouts, offline-safe)
  │    TAP discover (same bandpass) → IBE cutout → mask → zscale PNG
  │    → spectrahunt-web/public/showcases/*.json + public/cutouts/*.png
  │
  ├─ backend/ (dev API only, never on the CDN)
  │    app.py: /health /api/showcases /api/showcase/{id} /api/epochs
  │            /api/cutout.png /api/resolve /api/skybot /api/citation
  │    epochs.py: TAP first, SIA2 fallback, never raises
  │    cutouts.py: lazy astropy — parse/mask/render, LVF wavelength gate
  │    crossmatch.py: SkyBoT / Sesame / Horizons, SQLite-cached
  │    cache.py: git-ignored scratch (WAL)
  │
  └─ spectrahunt-web/ (Next.js 16, output:export → out/)
       Home (#/) → Blink (#/blink/<id>) → Sky (#/sky) → About (#/about)
       BlinkComparator (slider/onion/diff + autoplay)
       AladinSky (Aladin Lite v3 CDN, DSS2 + marker, offline-safe)
       lib/showcases.ts (static fetch; live only if DATA_MODE=live + API_URL)
       lib/store.ts (zustand: view + showcaseId)

CDN: Netlify, base spectrahunt-web/, build npm ci && npm run build, publish out/.
Python never runs on the CDN. png:null is a valid state (story + Aladin still render).
```

## Decisions

* Static-first: committed JSON+PNG under 10MB; 70–300MB MEFs never reach browsers.
* TAP-primary (no lag), SIA2 fallback (~1d lag), S3 for bulk only.
* Same-band blink only: `energy_bandpassname` D1–D6, |Δλ| < ½ mean bandwidth.
* Aladin for context, Firefly/IRSA Viewer as outbound link, never embedded.
* QR-proof: `collection` + `bandpass` params everywhere; QR2 now, QR3 = one-line switch.
* Cross-match client-side, cached; never blocks the blink.

## Workflows

1. Author showcase → JSON with `png:null` → run indexer → verify → commit JSON+PNG.
2. Weekly refresh → rerun indexer → `npm run build` → push (CDN auto).
3. Dev live mode → `python -m backend` + `DATA_MODE=live` frontend.

## Testing

`pytest backend/tests/ -q` (gate, schema, cache, API) · `npx eslint` (clean) ·
`npm run build` (exports `out/showcases/*.json`). Manual: each showcase <2s offline,
slider/onion/play touch+keyboard, Aladin-blocked still shows coordinates.
