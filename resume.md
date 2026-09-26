# Resume — DRISHTI work session

ARCHIVED — do not quote; see production-knowledge.md for current numbers. Saved: 2026-09-23 morning (main pushed; data jobs deliberately stopped for off-peak rerun).

Repo: `akashtori-13/drishti` (renamed from spectrahunt). Local dir still
`~/Documents/spectrahunt` (rename when quiet — venv/paths break otherwise).
Brand: DRISHTI (Team AKASHTORI). Latest: on `main`, tag `v1.0.1` published with
4 release assets (signed APK, exe, AppImage, deb).

## State snapshot

- 20 showcase fields, **108 epochs (all PNG-backed)**, 208 cutouts, 40 compare frames
- **13/20 measurement reports** (`public/reports/`, classifier stopped mid-run — resume it)
- Bands: 19 fields 6/6 detectors, galactic-center 3/3 (coverage limit, terminal)
- 2,590-cell census; NEP 7-frame median deep stack live; lmc 2→5, virgo 2→6 epochs
- Tests: 16 backend + 43 frontend, tsc/eslint 0 errors, build green
- Code landed since last save: PWA (icons/SW/install), AR point-at-sky (+tests),
  dice→random-blinkable, frame retry loader, onboarding order, mobile overflow fixes,
  hydration fixes (Tutorial, sky clock), root error boundary, fetch timeouts,
  Capacitor APK shell, Tauri desktop shell, Makefile, release.py, release CI,
  full-brief README, About upgrades (ground truth/method/impact/team),
  CLASSROOM + VIDEO beats + content-team docs, production-knowledge.md, docs/OPS.md

## What dies on shutdown (all resumable)

| Job | Resume command (run ~4–5 PM Dhaka = off-peak IRSA) |
|---|---|
| Deep fill chain | `.venv/bin/python scripts/build_multiepoch.py --max 8 --timeout 150 && .venv/bin/python scripts/classify_fields.py --force` |
| Bandstack leftovers | `.venv/bin/python scripts/build_bandstack.py --timeout 120` (19/20 done) |
| NEP stack | done (7-frame median live); rerun only to go deeper |
| Audit loop / watcher | `scripts/audit_loop.sh`, `scripts/watch_push.sh` (optional) |

Catch-all resume:

```bash
cd ~/Documents/spectrahunt
.venv/bin/python scripts/build_multiepoch.py --max 8 --timeout 150
.venv/bin/python scripts/classify_fields.py --force
.venv/bin/python scripts/build_bandstack.py --timeout 120
cd spectrahunt-web && npm run build && npx cap sync android
cd ~/Documents/spectrahunt && git add -A && git commit -m "data: fill" && git push origin main
```

## Restart servers

```bash
cd ~/Documents/spectrahunt/spectrahunt-web && npm run dev   # :3000 (background shell)
# backend API only if live mode needed: .venv/bin/python -m backend  # :8000
```

Kill by exact PID only (`pgrep -af`, verify dead — never bare `pkill -f`,
never `kill $(ps … | head -1)`).

## IRSA timing (Dhaka clock)

Best fetch 3–9 PM (US asleep, sweet spot 5–7 PM). Worst 10 PM–7 AM (US workday).
Serial `--jobs 1` when flaky, `--jobs 4` when healthy. No partial NEP persistence.

## Environment quirks (this box, Arch)

- Gradle needs JDK 21 (`~/jdks/`); Java 27 breaks Groovy, JDK 17 can't do source 21
- Rust via rustup (`~/.cargo`); AppImage needs `NO_STRIP=1`, `APPIMAGE_EXTRACT_AND_RUN=1`,
  pixbuf-stub `PKG_CONFIG_PATH` — all inside `scripts/bundle_linux.sh`, use it
- Android SDK `~/Android/Sdk`; release key ONLY in `~/.config/stellar/` (git-ignored, back it up)
- PKCS12: keyPassword must equal storePassword
- CI: Node 22, direct sdkmanager (setup-android@v3 obsolete), publish needs flatten step
- `/tmp` wiped on restart — validation scripts lived there; promote keepers to repo
- No sudo; no Xvfb; session is Wayland (X screenshots come out black)

## Backlog (judges-relevant, unordered)

- **User inputs needed**: exact 2026 challenge title, member names/roles, 2 quotes,
  hallway-test notes, filmed 240s video (synthetic v1 at `~/Downloads/stellar-pitch-v1.mp4`)
- Tag v1.0.2 with 20/20 wave (CI rebuilds all platforms; attach signed APK after)
- CI keystore secrets (else keep manual signed-APK step); prove `refresh.yml` e2e
- Deploy `out/` to Netlify; TWA Play listing ($25); local dir rename → `stellar`
- Content crew zips (NOT in git): `~/Downloads/stellar-content-team.zip` (docs),
  `~/Downloads/stellar-ui-captures.zip` (39 screenshots + 6 videos)
- Stretches: Horizons overlays, WISE side panel, 3D view, i18n, community aggregation
