# Contributing to STELLAR

Welcome — this is a real NASA Space Apps codebase with real users. The bar:
every pixel traceable, every failure graceful, every change verified.

Start with `README.md` (what/why), `SYSTEM_DESIGN.md` (whole design),
`docs/FRONTEND.md` + `docs/PIPELINE.md` (how), `docs/API.md` (contracts).

## Setup

```bash
git clone <repo> && cd spectrahunt
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd spectrahunt-web && npm install
```

Run everything (two terminals):

```bash
# terminal 1 — backend (dev API, live IRSA proxy)
.venv/bin/python -m backend            # :8000/health
# terminal 2 — frontend (live mode talks to the API)
cd spectrahunt-web
NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev  # :3000
```

Production preview (what users get — static, no backend):

```bash
cd spectrahunt-web && npm run build && ../.venv/bin/python ../scripts/serve.py out 3000
```

Environment: `NEXT_PUBLIC_DATA_MODE` (`static` default | `live`),
`NEXT_PUBLIC_API_URL` (dev API base). No secrets, no `.env` needed.

## Workflow

1. **Scope the data first.** Any feature touching the sky: confirm what IRSA
   actually returns today (see `docs/PIPELINE.md` failure playbook) before
   designing around it.
2. **Small, verified steps.** One concern per commit. Each commit must hold:
   `pytest backend/tests/ -q` green, `tsc --noEmit` clean,
   `npx eslint src` 0 errors, `npm run build` green.
3. **Never break the bundle.** `public/` is the product: keep PNGs ≤ 100 KB,
   `out/` < 10 MB, `png:null` valid, no FITS in git.
4. **Honesty UI.** Missing data renders as missing. No placeholders that look
   like measurements. Copy changes should say what is known and what isn't.

## Conventions

- Python: lazy heavy imports (astropy/numpy stay out of module import time so
  tests stay light); never raise across API boundaries (`detail` strings);
  daemon-thread bounds on all TAP calls; `print()` diagnostics, never silent.
- TypeScript: `'use client'` where needed; canvas overlays must share math
  with their click inverses (verify against real frames — `SYSTEM_DESIGN.md` §7);
  no new deps without a bundle-size note in the PR.
- Tests: pure functions preferred (synthetic arrays, no network); network
  paths use tmp DBs + stubbed discovery; backend tests must finish in seconds.
- Docs: behavior changes update `docs/` + relevant `ARCHITECTURE.md` section
  in the same PR. If you verified an external API's behavior, write it down
  (URL, date, what it returned) — the next person will thank you.

## PR checklist

- [ ] Tests/lint/build green (paste the commands + results)
- [ ] No bundle-budget regression (`du -sh spectrahunt-web/out`)
- [ ] Empty/offline states still render honestly (screenshots for UI PRs)
- [ ] Keyboard + 360 px + reduced-motion sanity (note what you checked)
- [ ] Attribution intact (IRSA/SPHEREx DOI on pages and exports)

## Decisions

Small fixes: just do them, document in the commit. Anything architectural
(new data source, new route family, new dependency, changed contracts):
open an issue first, get agreement, then build. ADRs live in
`SYSTEM_DESIGN.md` §10 — append, don't rewrite history.

## Operations

- Ports: kill by exact PID only (`pgrep -f`, verify dead before rebinding).
- Never commit `data/` scratch, `.cache/`, `out/`, or FITS (all git-ignored).
- Weekly refresh runs `scripts/` → rebuild → verify → commit; the loop
  scripts live in `/tmp/opencode/` during development sprints.
