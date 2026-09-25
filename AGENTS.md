# DRISHTI — agent working rules (repo-wide)

## Data retention: never lose a download
- IRSA/JPL servers are flaky and demos may run offline. **Keep every file
  downloaded from external servers.** `fetch_ibe` persists all FITS to
  `data/fits-cache/` (gitignored, disk-only); never reintroduce temp-dir
  downloads that delete after measuring.
- Shipped pages must read **precomputed JSONs** (`spectrahunt-web/public/`,
  `data/*.json`), never live external fetches. A fresh clone with no
  network must still build, test (backend suite is network-free via
  `data/horizons_cache.json`), and serve every data panel.
- Evidence over re-derivation: track/pairfit/forensics JSONs are committed;
  large binaries (FITS) stay on disk, never in git (`*.fits` is ignored).

## Honesty rule for data UI
- Every pixel/number traces to IRSA or says so; simulated views are labeled
  as interpretation. No calibrated-looking scores, no "AI discovers" copy.

## Verification
- Verify via execution: tests/build/screenshots. Prefer editing existing
  files. Keep 44px touch targets, ARIA roles, reduced-motion guards.
