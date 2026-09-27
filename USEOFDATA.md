# USE OF DATA — what DRISHTI uses, transforms, and owes

Every pixel and number in this app traces to an archive below, or is labeled
as interpretation. This file is the map.

## 1. Sources (what we take, what we owe)

| Source | Product we use | Where shown | License / attribution |
|---|---|---|---|
| NASA/JPL-Caltech SPHEREx via IRSA | QR2 spectral images (L2 MEF), TAP + IBE cutouts; QR3 where covered | Blink frames, spectra, tracks, verdicts | DOI **10.26131/IRSA652** (QR2), **10.26131/IRSA662** (QR3); enforced in-app (footer, cite-box, export stamp, per-showcase citation) |
| ESA Gaia DR3 | Star positions + magnitudes (cone queries) | Sky overlays, "Known star" labels | Credit (Mission page, README); no DOI in repo |
| CDS SIMBAD / Sesame | Object identity + coordinates resolve | Search, cross-match links | Credit; no DOI in repo |
| NASA/JPL Horizons | Small-body ephemerides (geocentric) | 3I/ATLAS tracked extraction, outbound links | Credit; no DOI in repo |
| IMCCE SkyBoT | Moving-object cone search (cached, breaker-guarded) | Candidate labels, status line | Credit; legacy endpoint currently 404s — labels say so |
| Minor Planet Center | Checker links only (no fetch) | Blink outbound links | Mentioned in README |
| CelesTrak (via mirror) | TLE sets, checksummed, freshness-gated | Orbit intro, live strip | Credit; no DOI in repo |
| CDS 2MASS / DSS HiPS | All-sky + context imagery (tiles + vendored base) | Hero, sky map, OtherEyes | Credit; no DOI in repo |
| Yale Bright Star Catalog v5 | 1,627 stars V≤5.0 (vendored) | Home sky layer | Credit |
| Messier/NGC positions | 16 nebula anchor coordinates (constants) | Sky glow renderer (**artistic rendering**, positions real) | Honesty contract in code |
| Constellation lines (d3-celestial/Ofrohn) | Vendored GeoJSON figures | Sky overlays, search | Credit |
| `data/popular_targets.txt` | 1,119 curated targets (our compilation) | Search/precache queue | Ours; SIMBAD-verified, method in `scripts/verify_targets.py` |
| Lowell Observatory Archives | Tombaugh 1930 Pluto plate crop — video inset only, not measurement | Pitch video Act I blink + Act II ghost inset (labeled `ARCHIVAL`), Card 2 credit | Archival courtesy; not data, no DOI in repo |

Only SPHEREx/IRSA carries a machine-enforced citation + DOI. Everything else
is credited by Sources-list links. No source is redistributed beyond fair-use
thumbnails and derived numbers; bulk archives stay at their hosts.

## 2. Processing (what we do to it)

1. **Discovery** (TAP → SIA2 fallback): coords + band → covering cutouts.
   Limit: TAP footprints ≠ IBE availability; some hits 422 on fetch.
2. **Fetch + retain**: every FITS persists to `data/fits-cache/` (never temp-only).
3. **Parse + mask**: IMAGE/FLAGS/VARIANCE/ZODI/WCS; bad bits excluded from
   photometry (never median-filled into measurements); masked cores flagged.
4. **Align**: WCS reproject, correlation fallback; non-overlap stays NaN.
5. **Photometry**: 3px aperture, annulus background, variance-aware errors.
   No zero-point, no aperture correction — fluxes are relative, and say so.
6. **Movers**: ±5σ dipole pairing; measured at lobes, not midpoints.
7. **Labels**: Gaia <5″, SkyBoT <10″ cone, else Unidentified/Unchecked.
8. **Tracking**: Horizons geocentric positions for moving targets.
9. **Pair fits**: simultaneous D1+D4/D2+D5/D3+D6 → amplitude + colour with
   propagated errors; cross-epoch χ²; masked cores excluded from verdicts.
10. **Ranking**: max colour signal; fully-masked targets UNRATED, never static.
11. **Render**: ZScale+Asinh PNGs are display-only — never measured.

## 3. Freshness & offline contract

- Shipped pages read precomputed JSONs (`spectrahunt-web/public/`, `data/*.json`).
- A fresh clone with no network builds, serves every panel, runs the backend suite.
- Live fetches (tiles, resolve, ephemeris) degrade to cached/bundled base with labels.
- Retention architecture: `SYSTEM_DESIGN.md` §6.1. Data rules: `AGENTS.md`.

## 4. What we don't do

- No invented detections, no calibrated-looking scores, no "AI discovers" copy.
- No simulated view presented as sky (replay is labeled simulation).
- No silent gap-filling: masked/failed/missing renders hollow or says why.
