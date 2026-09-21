# SpectraHunt Pipeline & Operations Guide

How real data gets from IRSA into the bundle — and how to keep it flowing.
Design context: `SYSTEM_DESIGN.md` §§4–6, 9. API shapes: `docs/API.md`.

## Module map (`backend/`)

| Module | Job | Key functions |
|---|---|---|
| `epochs.py` | TAP-first discovery, SIA2 fallback | `tap_cutout_urls` (daemon-thread bound, `newest`, `limit`), `discover_epochs` (never raises) |
| `cutouts.py` | FITS → PNG | `fetch_ibe` (retries 5xx w/ backoff, 422 fast-fail), `parse_fits` (IMAGE/FLAGS/VARIANCE/WCS-WAVE), `mask_bad_pixels`, `render_png` (zscale+asinh), `wavelengths_match` (LVF gate) |
| `align.py` | Geometry | `align_images` (WCS reproject → correlation fallback), `sky_to_pixel` |
| `photometry.py` | Measurement | `aperture_flux`, `significance_map`, `find_dipoles`, `measure_field` |
| `pipeline.py` | Orchestration | `discover_cached` (1 h + stale), `detect_field`, `lightcurve_for` / `spectrum_for` (6 h + stale), `field_report` |
| `crossmatch.py` | Catalogs | SkyBoT (degraded — SSP migration), SIMBAD-first resolve, Horizons, `query_gaia` + `query_gaia_cone` (30 d) |
| `cache.py` | SQLite scratch | `kv`, SkyBoT table, `api_cache` + `api_cache_age`, `allow_stale` reads |
| `detect.py` | Fast path | SEP→photutils→scipy→numpy peak finder + `match_epochs` |

## Scripts (`scripts/`)

| Script | Job | Cadence / notes |
|---|---|---|
| `sky_census.py` | All-sky obscore census → `public/coverage.json` | 72 boxes; `--shard I/N --progress f` for parallel workers; `--merge` (parse-retry, abort-safe); `--publish-only` |
| `build_showcases.py` | Showcase PNG indexer | `--only <id> --size 0.15 --timeout 120`; oldest+newest pairing; **tries ≤5 sibling frames** (IBE 422s are common); offline-safe (`png:null` preserved) |
| `process_field.py` | One position → `data/reports/field_*.json` | `--ra --dec --band`; used to precompute static reports |
| `serve.py` | Static server | no-store HTML (auto hard-refresh), immutable hashed assets |

## The weekly refresh (and the overnight pattern)

```bash
.venv/bin/python scripts/sky_census.py --shard 0/4 --progress data/census_shard_0.json &
# ... shards 1..3 ...
.venv/bin/python scripts/build_showcases.py --size 0.15 --timeout 120
.venv/bin/python scripts/sky_census.py --merge
cd spectrahunt-web && npm run build
```

`.github/workflows/refresh.yml` automates this weekly. During heavy ingestion
we run `scripts/nightly.sh`: merge → fill → build → verify
(cells/PNGs/API/tests) → commit-if-changed, with a **regression guard**
(never publish fewer cells than live).

## Caches & budgets

- TAP: daemon-thread bounds (60–180 s), `TOP` caps (30k census, 50 discovery);
  4 parallel census workers max; off-peak batching. Discovery cached 1 h.
- IBE: 2 retries w/ backoff on 5xx/network; 422 fails fast → sibling frames.
- Frame PNGs: `.cache/pngs`, pruned past 500 newest.
- Bundle: PNG ≤ 100 KB each, total `out/` < 10 MB (now ~3.3 MB).

## Failure playbook

| Symptom | Likely cause | Action |
|---|---|---|
| `Arrays do not overlap` (422) | TAP footprint vs IBE array mismatch | automatic: next sibling frame; no code change needed |
| IBE 503 / timeouts | IRSA instability | backoff retries; rerun indexer later; stale caches cover reads |
| TAP > 60 s / hangs | queue congestion | daemon bound returns; shrink box, raise `--top` cautiously, retry off-peak |
| SkyBoT 404/`[]` | legacy endpoint retired (SSP migration) | expected; manual links in UI; do not "fix" by guessing URLs — verify first |
| Sesame empty `%J` | endpoint behavior change | SIMBAD-ASCII-first already handles; keep fallback |
| coverage.json shrinks | torn-read merge or reset race | regression guard restores backup; merges are retry-guarded; check worker logs |
| Build fails on `*.ts` routes | static export needs `force-static` | add `export const dynamic = 'force-static'` |
| Port busy (`:3000`/`:8000`) | stale server | kill by exact PID (`pgrep -f`), never `pkill -f` on a self-matching pattern, never `kill $(ps…|head -1)` (header!) |
| Test hangs for minutes | real network via shared DB cache | tests must use tmp DB + stubbed discovery (see `test_detect_endpoint_shape`) |

## Adding a showcase field

1. Append JSON to `spectrahunt-web/public/showcases/` (copy `virgo-field.json`;
   honest story, no invented specifics; `png: null`).
2. Add the id to `SHOWCASE_IDS` (`lib/showcases.ts` + `backend/app.py`) and
   `SHOWCASE_POINTS` (`SkyPage`, `HomePage`). Tests read `SHOWCASE_IDS`
   dynamically — no test edits needed.
3. `python scripts/build_showcases.py --only <id> --size 0.15` → commit JSON+PNG.
4. Rebuild; the blink route prerenders automatically (`generateStaticParams`).
