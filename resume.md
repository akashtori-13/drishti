# Resume — STELLAR work session

Saved: 2026-09-22 (all code + data pushed to `main`).

## State snapshot

- 20 showcase fields, ~69 epochs, ~190 images (cutouts + compare + bands)
- 2,590-cell measured sky census (`public/coverage.json`)
- 9–20 measurement reports (`public/reports/`, classifier still running at save time)
- Tests: 16 backend + 16 frontend, lint/tsc clean, build green
- NEP 9-visit median deep stack: code ready, IRSA too slow twice — rerun
  `scripts/nep_stack.py --n 12 --timeout 45 --jobs 4`

## What dies on shutdown (all resumable)

| Job | Resume command |
|---|---|
| Multi-epoch wave 2 (9 fields) | `scripts/build_multiepoch.py` loop — skips complete fields automatically |
| Band-stack resume (all-6 detectors) | `.venv/bin/python scripts/build_bandstack.py` |
| Classifier (remaining fields) | `.venv/bin/python scripts/classify_fields.py` (skips fresh reports) |
| NEP deep stack | `.venv/bin/python scripts/nep_stack.py --n 12 --timeout 45 --jobs 4` |
| Audit loop / watcher | `scripts/audit_loop.sh`, `scripts/watch_push.sh` (optional) |

Catch-all resume (runs everything unfinished, then rebuilds + commits + pushes):

```bash
cd ~/Documents/spectrahunt
.venv/bin/python scripts/build_multiepoch.py --max 6
.venv/bin/python scripts/build_bandstack.py
.venv/bin/python scripts/classify_fields.py
.venv/bin/python scripts/nep_stack.py --n 12 --timeout 45 --jobs 4
cd spectrahunt-web && NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
cd ~/Documents/spectrahunt && git add -A && git commit -m "resume: data fill" && git push origin main
```

## Restart servers

```bash
cd ~/Documents/spectrahunt
nohup .venv/bin/python -m backend > /tmp/opencode/spectrahunt-logs/backend.log 2>&1 &
nohup .venv/bin/python scripts/serve.py spectrahunt-web/out 3000 > /tmp/opencode/spectrahunt-logs/frontend.log 2>&1 &
# App: http://localhost:3000/ · API: http://localhost:8000/health
```

Kill by exact PID only (`pgrep -f`, verify dead before rebinding — never
`kill $(ps … | head -1)` (header) or bare `pkill -f` (matches own shell).

## Backlog (judges-relevant, unordered)

- Demo video (240 s) + pitch one-pager from `docs/ONEPAGER.md` + `DEMO.md`
- Deploy `spectrahunt-web/out` to Netlify (config ready in `netlify.toml`)
- True on-screen cardinals (alt-az inverse parked in `docs/TROUBLESHOOTING.md`)
- Weekly CI refresh (`.github/workflows/refresh.yml` exists, unproven end-to-end)
- Stretches: Horizons overlays, WISE side panel, 3D view, i18n, community aggregation
