# Troubleshooting

Symptom-first guide. Design context in `SYSTEM_DESIGN.md`; pipeline ops in
`docs/PIPELINE.md`; API shapes in `docs/API.md`.

## Users see…

| Symptom | Meaning | What to do |
|---|---|---|
| Old UI after an update | Browser cached entry HTML | Hard refresh (Ctrl+Shift+R). Server sends `no-store` on HTML, so this should be rare — report it if persistent |
| “Cutout pending” tile | Indexer hasn't rendered this epoch yet (or IBE refused all siblings) | Metadata still works; check back after refresh, or use live mode |
| “Not yet surveyed” field | No TAP coverage in that cell (2 cells near the south pole are genuinely empty in QR2) | Pick a neighboring cell |
| “Fewer than 2 visits here” (live blink) | < 2 covering images found | Honest empty state; try a curated field |
| “No SkyBoT match” | SkyBoT legacy API retired (SSP migration) or truly empty field | Use MPC-checker / Horizons / SIMBAD links below it |
| Sky view keeps “Loading” | hips2fits slow or unreachable | Overlays + cached tiles still work; retries automatically; check `/api/health` |
| Blank blink stage | Frame PNG failed to load | Epoch chips show labels regardless; retry, or step to another epoch |

## Developers hit…

| Symptom | Meaning | Fix |
|---|---|---|
| Build fails on `sitemap.ts`/`robots.ts`/etc. | Static export requires `force-static` on route files | Add `export const dynamic = 'force-static'` |
| `await searchParams` build error | Same root cause | Read query client-side (`window.location.search` / Suspense + `useSearchParams`) |
| Port 8000/3000 busy | Stale server | Kill by **exact PID** (`pgrep -f`, confirm dead). Never `kill $(ps … \| head -1)` (kills the header match) or bare `pkill -f` (matches your own shell) |
| Test suite hangs for minutes | A test reached real IRSA via the shared dev DB cache | Isolate: tmp DB + stubbed discovery (see `test_detect_endpoint_shape`) |
| `asyncio.run() … running event loop` | Sync wrapper called from async request scope | `await` the coroutine; keep `asyncio.run` in scripts only |
| `IndentationError` after scripted edits | Mechanical edit drift | `python -c "import ast; ast.parse(...)"` before running |
| Coverage count drops after merge | Torn reads during worker rewrites, or mixed-era files | Regression guard restores backup; merges retry parses; check worker logs, re-merge |
| eslint `set-state-in-effect` on async loads | Legit pattern, noisy rule | Targeted `eslint-disable-next-line` with the reason inline |
| eslint `refs` on stable callbacks | False positive for props-in-events | Same treatment — one line, documented |
| Canvas looks mirrored vs data | Projection orientation assumption | Stop and verify against a real frame before "fixing" (`SYSTEM_DESIGN.md` §7) |

## Upstream status (last verified 2026-09-22)

| Service | Status | Notes |
|---|---|---|
| IRSA TAP (`spherex.*`) | OK, slow (20–120 s) | Bound + cached; off-peak batching |
| IRSA IBE cutouts | Flaky (503s, per-frame 422s) | Retries + sibling-frame fallback |
| Gaia TAP | OK | 30 d cache |
| SIMBAD ASCII (`sim-id`) | OK | Primary resolver |
| CDS Sesame | Degraded (empty replies) | Fallback only |
| SkyBoT legacy cone API | **Retired (404)** | SSP migration; manual links until re-integrated |
| Alasky HiPS / hips2fits | OK, CORS-open | Core imagery; device-cached |
| ofrohn GitHub mirror | OK | Vendored locally; remote is fallback |

Check live status anytime: `curl localhost:8000/api/health`.
