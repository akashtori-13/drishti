# DRISHTI — agent working rules (repo-wide)

## Data retention: never lose a download
- IRSA/JPL servers are flaky and demos may run offline. **Keep every file
  downloaded from external servers.** `fetch_ibe` persists all FITS to
  `data/fits-cache/` (gitignored, disk-only); never reintroduce temp-dir
  downloads that delete after measuring.
- Shipped pages must read **precomputed JSONs** (`spectrahunt-web/public/`,
  `data/*.json`), never live external fetches for science numbers; labeled live imagery/resolve (HiPS tiles, Sesame/SIMBAD suggest) is allowed with offline fallbacks. A fresh clone with no
  network must still build, serve every data panel, and run the backend
  suite (which is network-free against the committed caches; a test that
  needs live IRSA must stub the DB layer — see docs/TROUBLESHOOTING.md).
- Note: `spectrahunt-web/AGENTS.md` is auto-generated Next.js boilerplate;
  follow it only when editing web code (vendored guide discipline).
- Evidence over re-derivation: track/pairfit/forensics JSONs are committed;
  large binaries (FITS) stay on disk, never in git (`*.fits` is ignored).

## Honesty rule for data UI
- Every pixel/number traces to IRSA or says so; simulated views are labeled
  as interpretation. No calibrated-looking scores, no "AI discovers" copy.

## Verification
- Verify via execution: tests/build/screenshots. Prefer editing existing
  files. Keep 44px touch targets, ARIA roles, reduced-motion guards.
