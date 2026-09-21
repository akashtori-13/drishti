# SpectraHunt API Reference

Base URL (dev/live): `http://localhost:8000`. Production is static-only —
these endpoints exist in `DATA_MODE=live` and power on-demand features.
Every endpoint is read-only, bounded, and degrades gracefully (never 500).

Conventions: `ra` 0–360°, `dec` −90–90°, `band` 1–6 (D1–D6),
`size_deg` ≤ 0.5 (default 0.05 ≈ 3′). Responses include a `detail` string
(`ok`, `need-2-epochs`, `fetch-failed`, `stale`, `error`).

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness: `{ok, release, version}` |
| GET | `/api/health` | Upstream status: TAP, IBE, Gaia, SkyBoT (`ok/degraded/down/moved`), cached 5 min |

```bash
curl localhost:8000/health
curl localhost:8000/api/health
```

## Catalog & metadata

| Method | Path | Notes |
|---|---|---|
| GET | `/api/showcases` | `{id,title,ra,dec}[]` for all 15 fields |
| GET | `/api/showcase/{sid}` | Full showcase JSON (404 for unknown) |
| GET | `/api/citation` | QR2 citation text + DOI + timestamp |

## Discovery & cutouts (IRSA proxy)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/epochs?ra=&dec=&band=&size_deg=` | Covering images oldest-first: `{cutout_url,mjd,bandpass}[]`. TAP-first (60 s daemon bound), SIA2 fallback, `[]` when unreachable |
| GET | `/api/cutout.png?ra=&dec=&band=&size_deg=` | Newest covering image rendered (zscale+asinh, bad-pixel masked), file-cached |
| GET | `/api/frames?ra=&dec=&band=&size_deg=` | ≤8 sampled epochs with per-epoch render URLs — makes **any** visited field blinkable |
| GET | `/api/frame.png?ra=&dec=&band=&size_deg=&epoch=i` | Renders epoch `i` (file-cached, pruned past 500) |

```bash
curl "localhost:8000/api/epochs?ra=180&dec=0&band=3"
curl "localhost:8000/api/frames?ra=180&dec=0&band=3" | head -c 400
```

## Name resolution & cross-match

| Method | Path | Notes |
|---|---|---|
| GET | `/api/resolve?q=` | Coordinates → echo; names → SIMBAD-ASCII-first, Sesame fallback; else `{ra:null,...unknown}` |
| GET | `/api/skybot?ra=&dec=&mjd=&radius_arcsec=` | IMCCE SkyBoT at exposure MJD (SQLite-cached). **Known-degraded**: legacy endpoint 404s since the SSP migration; returns `[]`, UI links out for manual checks |
| GET | `/api/stars?ra=&dec=&fov_deg=` | Gaia DR3 cone (mag limit scales with FOV, TOP 2000, cached 30 d) for observer overlays |

```bash
curl "localhost:8000/api/resolve?q=M31"          # -> 10.68, +41.27
curl "localhost:8000/api/stars?ra=83.8&dec=-5.4&fov_deg=5" | head -c 200
```

## Measurement pipeline

| Method | Path | Notes |
|---|---|---|
| GET | `/api/detect?ra=&dec=&band=&size_deg=` | WCS-aligned B−A significance dipoles + aperture fluxes + Gaia/SkyBoT labels. Discovery cached 1 h; `skybot_status: ok/empty/unavailable` |
| GET | `/api/lightcurve?ra=&dec=&band=&size_deg=` | Aperture flux at one position across ≤5 sampled epochs (cached 6 h, stale-served) |
| GET | `/api/spectrum?ra=&dec=&size_deg=` | Newest-epoch flux in all 6 bands = real mini-spectrum (cached 6 h, stale-served) |

```bash
curl "localhost:8000/api/detect?ra=180&dec=0&band=3" | head -c 500
# -> 31σ mover + variables with flux_a/flux_b at the ecliptic field
```

## Caching model (SQLite `data/spectrahunt.db`, git-ignored)

| Store | TTL | Contents |
|---|---|---|
| discovery (`api_cache`) | 1 h, **stale-served on outage** | TAP hit lists |
| products (`api_cache`) | 6 h, stale-served | lightcurve/spectrum payloads |
| Gaia/SkyBoT | 30 d | cone results, float-rounded keys |
| health | 5 min | upstream probes |
| frame PNGs (`.cache/pngs`) | file cache, pruned > 500 | rendered epochs |

## Failure semantics

- Unknown showcase/epoch → 404 with message. Empty sky → `[]` or `detail:
  need-2-epochs`. Upstream 5xx/network → retried (IBE: 2× backoff; 422 fails
  fast — footprint mismatch, indexer tries sibling frames). Upstream down →
  stale cache or honest `detail`, never 500 (except truly unexpected paths,
  which still return JSON via the generic guard).
