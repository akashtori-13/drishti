# DRISHTI — Production Knowledge

Single ops bible for Team AKASHTORI: environments, secrets, releases, CI/CD,
data ops, runbooks, and every environment quirk discovered the hard way.
Public repo — **no secrets in this file, only their locations.**

## 1. Environments

| Env | Frontend | Backend | Data |
|---|---|---|---|
| Local dev | `:3000` (`npm run dev`, live mode) | `:8000` (`python -m backend`) | `public/` + SQLite `data/spectrahunt.db` |
| Production web | Netlify static export (`spectrahunt-web/out`) | none (static-only prod) | baked JSON/PNG in `out/` |
| Live mode | `NEXT_PUBLIC_DATA_MODE=live` + `NEXT_PUBLIC_API_URL` | FastAPI IRSA proxy | on-demand + caches |
| Android | `drishti-1.0.x.apk` (offline bundle) | none (bundled) | baked in |
| Desktop | AppImage / deb / nsis (Tauri) | none (bundled) | baked in |

`make up | warm | check | web | down` (repo-root Makefile) drives local. Production
default is **static**: the site never needs the backend at runtime.

## 2. Secrets & keys (locations only — back these up)

| Secret | Lives | Notes |
|---|---|---|
| Android release key | `~/.config/stellar/release.keystore` + `KEYSTORE-PASSWORDS.txt` (`chmod 600`) | Self-signed, 25y, Team AKASHTORI. **Loss = new Play identity, updates impossible.** Back up off-machine. Never committed (`.gitignore`: `*.keystore`, `keystore.properties`) |
| Local signing link | `spectrahunt-web/android/app/keystore.properties` | Git-ignored. CI uses env vars instead |
| CI signing | **NOT YET SET** — add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` as GitHub Secrets; `release.yml` already reads them (`DRISHTI_KEYSTORE_*`). Until then CI APKs are unsigned; the signed APK is attached manually (see §4) |
| Play Console | future, $25 one-time, team account | TWA listing deferred; Capacitor sideload covers judging |
| Apple | n/a (no iOS target) | $99/yr — explicitly out of scope |
| Netlify | team token in Netlify dashboard | Deploys `spectrahunt-web/out` per `netlify.toml` |
| GitHub | `gh` CLI token (keyring) | Used for releases, CI dispatch, log reads |

## 3. Release process

- Version truth: `spectrahunt-web/package.json` (+ mirrors: `desktop/.../Cargo.toml`, `tauri.conf.json`, Android `versionCode/versionName`). Bump via `scripts/release.py --version X.Y.Z`.
- `scripts/release.py`: builds web → stamps `out/build-info.json` (version, commit, data counts) → optional Android/desktop → collects versioned files into `dist/` (git-ignored).
- Flow: commit to `main` → tag `vX.Y.Z` → push tag → `release.yml` builds all platforms (~35 min) → `publish` job creates the GitHub Release.
- **Local ship (no CI minutes):** `scripts/release.py --version X.Y.Z` builds web + debug APK + Linux bundles on this machine (needs JDK 17–23 via `~/jdks`, Tauri system deps); signed APK via `DRISHTI_KEYSTORE_*` env; Windows NSIS via the `cargo-xwin` + home-built `makensis` recipe in TROUBLESHOOTING; AppImage via raw `appimagetool` on the finished AppDir. Publish with `gh release create vX.Y.Z dist/*` (or `gh release upload` to amend).
- **Tags move only before any release exists.** Once published, never force-move; cut a patch version instead.
- After CI publishes: upload the locally signed APK (`gh release upload vX.Y.Z dist/drishti-*.apk --clobber`) since CI has no keystore secrets yet.
- Stable download links: `github.com/akashtori-13/drishti/releases/latest/download/<file>`.

## 4. CI/CD

| Workflow | Trigger | Notes |
|---|---|---|
| `refresh.yml` | weekly | Data refresh. **Unproven end-to-end — prove before relying on it.** Has regression guard (never publish fewer cells) |
| `release.yml` | tag `v*`, manual dispatch | android + linux + windows + publish. ~35 min (Windows Rust compile is the long pole) |

Failures already hit and fixed (don't regress):
- `android-actions/setup-android@v3` runs obsolete `sdkmanager tools` → install platform packages directly from the runner's preinstalled SDK (`sdkmanager` needs `cmdline-tools/latest/bin` on PATH).
- `npm ci` ERESOLVE (vitest/@types/node) → `spectrahunt-web/.npmrc` pins `legacy-peer-deps=true`. Do not remove.
- Capacitor CLI needs Node ≥22 → workflow pins Node 22 (also silences the Node-20 deprecation warning).
- `publish` missed nested bundles → flatten step (`find dist -type f … -exec mv -t dist`) before upload.
- `workflow_dispatch` runs cannot publish (no tag context) — real releases only come from tag pushes.

## 5. Hosting & deploy

- Netlify: base `spectrahunt-web/`, `npm ci && npm run build`, publish `out/`, `NEXT_PUBLIC_DATA_MODE=static`. Headers in `netlify.toml`: JSON as `application/json`, immutable `_next/static`, PNG caching, `.git` blocked. **No `Access-Control-Allow-Origin`** — third-party *browser* apps can't fetch our JSON yet (curl/Python/git work); adding it is a deliberate product decision, not an oversight.
- Backend never deploys to Netlify. Live API is a local/on-demand tool until a hosting decision (Fly.io ~$5/mo recommended over Render free cold starts).

## 6. Data operations

Resume any stalled fill (all idempotent, safe to re-run):
- `classify_fields.py` — skips fresh reports; target 20/20
- `build_bandstack.py --timeout 120` — all-6 detectors (galactic-center maxes at 3/3: coverage limit, terminal state)
- `build_multiepoch.py --max 6 --timeout 120` — skips complete fields
- `nep_stack.py --n 12 --timeout 180 --jobs 1` — serial; needs 3+ usable frames per run, no partial persistence
- `sky_census.py --shard I/N` + `--merge` — 2,590-cell baseline; merges are retry-guarded

IRSA playbook (slow/flaky upstream): raise timeouts before parallelism; serial (`--jobs 1`) beats parallel against disconnects; backoff retries built into `fetch_ibe`; 422 = footprint mismatch, try sibling frames (automatic); TAP daemon bounds 60–180s.

## 7. Runbooks

- **Restart dev**: `npm run dev` in `spectrahunt-web/` (port 3000). Kill by exact PID only (`pgrep -f`), never bare `pkill -f`, never `kill $(ps … | head -1)`.
- **Port busy**: stale server — find PID, verify, kill, rebind.
- **HMR lies**: editing a `useEffect` dep array mid-session throws transient "deps changed size" errors; full reload clears. Editing hooks in two steps can flash duplicate-declaration states — save complete edits together.
- **`/tmp` is wiped on restart**: Playwright validation scripts (`shot.js`, `onboard.js`) lived there and died with it. Promote keepers into the repo before relying on them.
- **Hydration**: any `localStorage`-seeded render must mount-gate (see Tutorial fix) or SSR/client diverge for returners.
- **Keystore loss**: unrecoverable for updates. See §2.

## 8. Health & monitoring

- `GET /health` → `{ok, release, version}` (liveness).
- `GET /api/health` → upstream probes (TAP/IBE/Gaia/SkyBoT), 5-min cached, never 500s.
- Data freshness signals: `out/build-info.json` (per-release counts), `coverage.json.generated_at`, report `measured_at` fields.

## 9. Environment quirks (this machine, Arch Linux)

- Gradle needs **JDK 21** (`~/jdks/`): Java 27 breaks Groovy (major version 71), JDK 17 can't compile `source release 21`.
- Rust via rustup (`~/.cargo`), minimal profile. Tauri Linux needs system webkit2gtk/gtk3 (present).
- AppImage bundling: `NO_STRIP=1` (bundled strip chokes on `.relr.dyn`), `APPIMAGE_EXTRACT_AND_RUN=1`, and a `PKG_CONFIG_PATH` shadow `.pc` because Arch ships **zero** gdk-pixbuf loader `.so` files (bundled AppImages lack pixbuf loaders — fine for a WebView app; CI/Ubuntu builds canonical artifacts).
- Android SDK at `~/Android/Sdk` (cmdline-tools + platform-36 + build-tools 36). No sudo on this box.
- PKCS12 keystores ignore per-key passwords: keyPassword **must equal** storePassword.
- Playwright browsers persist in `~/.cache/ms-playwright` (survive `npm uninstall`).

## 10. Pre-judging checklist

- [ ] CI keystore secrets set (else keep manual signed-APK step)
- [ ] `refresh.yml` proven end-to-end
- [ ] Challenge title + member names wired (NASA page, README, About, video)
- [ ] 240s video + subtitles + poster fallback
- [ ] Dead-wifi rehearsal (airplane-mode APK first)
- [ ] Private-window link audit (repo, video, release assets, NASA page)
- [ ] `npm audit` re-check; Capacitor 9 upgrade scheduled post-competition

## 11. Brand & identity

- **DRISHTI** — *SPHEREx Transient Explorer & Light-spectrum Large-scale Archival Repository*, by **Team AKASHTORI**, NASA Space Apps Challenge 2026.
- npm `stellar-web` (frozen legacy name) · Tauri `drishti.akashtori.space` · Android `drishti.akashtori.space` · IRSA user-agent `DRISHTI/1.0` · CI bot `stellar-bot` · copyright Team AKASHTORI (MIT + SPHEREx/IRSA attribution).
- Deliberately unchanged (invisible) identifiers: `spectrahunt-web/` dir, `spectrahunt:` DOM events, `sh-*` storage keys, `spectrahunt-sky` tile cache, `spectrahunt-ui` skill id, `data/spectrahunt.db`. GitHub repo itself renamed to `akashtori-13/drishti` (old URLs redirect).

## 12. Feature inventory (everything shipped)

- **Home `/`**: real-sky hero mini-map with field markers, object/coordinate search, Try chips + dice, featured-detection carousel, field rail, live numbers band, how-it-works, install-app chip, first-visit tutorial (4 steps), session toast (mutually exclusive with tutorial).
- **Sky `/sky`**: Stellarium observer view (HiPS DSS color / 2MASS IR tiles, GPS locate, live clock ±hour stepping, constellation figures, equatorial grid, Gaia DR3 stars, Sun/Moon computed markers, cardinal ring, hover readout with Alt/Az + RA/Dec), all-sky coverage-map toggle (2,590 measured cells), inspector with blink entry, **point-at-sky AR mode** (compass + tilt + GPS + clock → live RA/Dec camera, heading/elevation HUD, ±45° compass trim, pause-on-drag, iOS permission flow).
- **Blink `/blink/[id]`** (+ live `/blink/live?ra=&dec=&band=`): autoplay transport, timeline scrub + filmstrip, **blink / side / swipe / diff / replay / color** modes, linear/log/sqrt/asinh stretch, 4 colormaps + invert, faint/balanced/bright presets, black/white levels, 102 channels across 6 detectors, RGB channel mapping, in-browser ±5σ mover/variable detection with markers, click-to-measure spectrum, light curve, band spectrum, catalog cross-links, share URLs encoding band+epoch+mode, exports (PNG figure, WebM animation, CSV, JSON), ⌘K command palette, keyboard transport.
- **Candidates `/candidates`**: measured cards (Known/Mover/Variable/Unidentified — never invented), top-σ + baseline stats, known-object names, all/unknown/known filters with counts, CSV/JSON export.
- **About `/about`** + **`/mission`** + **`/crew`**: mission, LVF same-band rule, band table, method precision (units, 6.2″/px, σ), **ground-truth panel (9/9 fixed targets ≤0.3′)**, impact, team, tours, glossary, shortcuts, citation, 7-source list.
- **Orbital intro `/intro`**: BORESIGHT acts — live SPHEREx orbit from real TLE, 716-object CelesTrak swarm, procedural spacecraft model, free-look camera, glitch transition to console home. Skipped by default on mobile/slow networks, opt-in via About.
- **Dice**: rolls a random *blinkable* showcase (skips pending fields, never re-rolls current), opens its blink directly. Pool: all 20 showcases.
- **PWA**: manifest + PNG/maskable icons, offline service worker (navigations network-first, JSON stale-while-revalidate, images cache-first ≤250), install chip, `NEXT_PUBLIC_DISABLE_SW=1` keeps dev HMR clean.
- **Shells**: Capacitor Android (bundled `out/`, system-browser links, hardware-back), Tauri desktop (nsis/appimage/deb, opener plugin). NativeShell adapter no-ops on web.
- **Accessibility**: skip link, aria labels/live regions, full keyboard map, `prefers-reduced-motion` respected, focus-visible rings.

## 13. Data inventory (verified 2026-09-23)

20 fields · **143 epochs, all PNG-backed** · 20/20 reports · 2,590 census cells ·
240 cutouts · 40 DSS2/2MASS context frames · `out/` 11 MB.

Per-field bands: 19 fields 6/6 detectors; galactic-center 3/3 (coverage limit).
Notables: 3I/ATLAS (13 movers, top 143σ, literature-cited), galactic-center (20 movers),
omega-cen (27 movers), orion (40 variables), NEP 7-frame median deep stack,
lmc 7 and virgo 8 epochs added in latest fill.

Report schema per field: movers, variables, top σ, baseline days, known-object
block with citation, **lightcurve[]** (MJD/flux), **spectrum[]** (6 bands, flux ± err).
Everything above is public JSON under `spectrahunt-web/public/` — reusable by any app.

## 14. API surface (FastAPI, read-only, never 500s on expected paths)

`GET /health` · `/api/health` (upstream probes, 5-min cache) · `/api/showcases` ·
`/api/showcase/{id}` · `/api/epochs` · `/api/cutout.png` · `/api/frames` ·
`/api/frame.png` · `/api/resolve` (SIMBAD-first) · `/api/skybot` (known-degraded,
SSP migration) · `/api/stars` (Gaia, 30-d cache) · `/api/detect` (±5σ dipoles) ·
`/api/lightcurve` · `/api/spectrum` · `/api/citation`. Full reference: `docs/API.md`.
OpenAPI auto-generated at `/docs` when the dev server runs.

## 15. Engineering highlights (mentionworthy)

- **Stale-while-revalidate showcase layer**: device copy serves instantly, background
  refresh swaps in via `sh-revalidate` events (Blink + Candidates listen) — first
  visits self-heal without reloads.
- **Self-healing image loader**: 3× backoff retry, failure state with Retry button
  instead of forever spinners; filmstrip + canvas both surface it.
- **Hydration discipline**: every `localStorage`-seeded render mount-gates (Tutorial
  pattern) — returners never mismatch SSR.
- **Deterministic onboarding**: persistent entry flag, mobile intro-skip, tutorial/toast
  mutual exclusion — verified 6/6 by scripted browsers (script was `/tmp`-ephemeral).
- **One source builds all**: single `out/` feeds web/PWA/APK/desktop; `make release`
  + `scripts/release.py` stamp `build-info.json` (version/commit/counts) into every build.
- **Sensor math proven**: alt/az↔RA/Dec inverse validated by 100+ round-trip cases
  (`skyposture.test.ts`); sign convention documented (south-based A flips cosine signs).
- **Honesty as architecture**: `png:null` → metadata + "pending"; empty sky → dark +
  "not yet surveyed"; degraded upstreams → labeled, never faked.
- **Test envelope**: 24 backend (pytest) + 58 frontend (vitest) + tsc + eslint (0 errors)
  + production build + Playwright narrow-viewport scans (360/320 clean).

## 16. Third-party credits (ship list)

SPHEREx/IRSA (IPAC) · CDS Strasbourg (DSS2, 2MASS, HiPS, SIMBAD) · ESA Gaia DR3 ·
IMCCE SkyBoT · JPL Horizons/MPC · CelesTrak TLE · d3-celestial constellation mirror
(ofrohn) · AWS Open Data (SPHEREx QR) · Google Fonts (Bricolage, Geist) · Next.js,
React, FastAPI, astropy, reproject, photutils, Tauri, Capacitor, Serwist-less
hand-rolled SW. (Video must credit all of these on screen.)

## 17. Release history

- **v1.0.0** — shells+PWA+AR+README baseline. CI partially failed (since fixed); artifacts backfilled manually.
- **v1.0.1** — onboarding order, mobile overflow fixes, NEP stack, lmc/virgo epochs, bandstack wave, rename follow-ups. CI fully green; signed APK attached manually.
- **v2.9 → v3.0.0** — measured SED panels, per-epoch wavelengths, single-spectrum dedupe, offline-first data layer, full offline precache bundle, Horizons-tracked comet spectrum + control star, pair-colour verdicts, field ranking, blink skip control, live-decode escape hatch. Artifacts built locally (CI billing blocked).
- **v3.1.0** — joint-likelihood pair engine (shared-R χ² + response-aware colour), masked-core photometry fix + forensics, FITS retention cache, pair-verdict + ranking panels, 5-target ranking set, all-sky offline base map, release tooling (signed APK scripted). Published with 5 local artifacts.

## 18. Known limitations (say these before judges find them)

- SkyBoT legacy endpoint retired (SSP migration) — returns `[]`; UI links out for manual checks.
- Classifier is conservative by design; faint fields report few/no candidates rather than guessing.
- `refresh.yml` weekly data CI unproven end-to-end.
- No iOS target (needs $99/yr Apple account + macOS runner); no Play listing yet (TWA path documented, $25 fee pending).
- Capacitor 9 upgrade deferred (alpha risk) — 3 moderate dev-only advisories accepted.
- AR compass accuracy is phone-hardware-limited (±5–15°); calibration trim + figure-8 hint included.

## 19. Data supremacy (the Best Use of Data case)

We did not visualize one dataset. We ingested eight sources, processed them through
a real measurement pipeline, and published everything back as open, reusable data.

### 19.1 Sources ingested (what we take from each)

| Source | What we pull | How |
|---|---|---|
| SPHEREx QR2 via IRSA TAP | observation metadata (obs_id, MJD, bandpass, footprints) | `epochs.py` ADQL, TOP-capped, daemon-bounded |
| SPHEREx QR2 via IRSA SIA2 | same, fallback (~1d lag) | automatic fallback |
| IRSA IBE cutout service | FITS level-2 spectral images per epoch | `cutouts.py`, 2× backoff, 422 fast-fail |
| IMCCE SkyBoT | known solar-system objects at exposure MJD | cone search, 30-d cache (legacy endpoint degraded → manual links) |
| SIMBAD / Sesame (CDS) | object names + types for queries | ASCII-first, Sesame fallback |
| JPL Horizons + MPC checker | ephemerides + minor-planet verification links | on demand, linked per epoch |
| Gaia DR3 (ESA) | star positions + G magnitudes for overlays | cone queries, mag-scaled, 30-d cache |
| DSS2 + 2MASS (CDS hips2fits) | context imagery per field ("same sky, other eyes") | `fetch_compare.py`, no TAP needed |
| CelesTrak | SPHEREx TLE (NORAD 63182) + 613-object swarm | `expand_swarm.py`, bundled JSON |
| d3-celestial mirror (ofrohn) | constellation line GeoJSON | vendored + upstream refresh |

### 19.2 Processing (what we do to it)

| Stage | Script/module | Input → output | Volume today |
|---|---|---|---|
| Discovery | `epochs.py` | coords → covering-image hit lists | 143 epochs across 20 fields |
| Fetch | `cutouts.py` | FITS → parsed arrays (IMAGE/FLAGS/VARIANCE/WCS-WAVE) | 240 cutouts rendered |
| Clean | `mask_bad_pixels` | flags+variance → science-ready pixels | every PNG |
| Render | `render_png` (zscale+asinh) | arrays → ≤100 KB PNGs | 7.2 MB total bundle |
| Align | `align.py` | WCS reproject, correlation fallback | every multi-epoch field |
| Measure | `photometry.py` | aperture flux, σ maps, dipole finder | 20/20 field reports |
| Classify | `classify_fields.py` | movers/variables/known + light curves + spectra | top 143σ (3I/ATLAS) |
| Census | `sky_census.py` | 72 obscore boxes → cells | 2,590 measured cells |
| Deep stack | `nep_stack.py` | 12 D4 visits → 7-frame median | NEP bonus epoch |
| Context | `fetch_compare.py` | hips2fits → per-field JPGs | 40 frames |
| Bands | `build_bandstack.py` | newest-visit PNGs per detector | 19×6 + 1×3 detectors |

Quality gates: LVF same-band rule enforced at index time; conservative classifier
(silence over guesses); ground-truth panel (9/9 ≤0.3′); honest nulls everywhere.

### 19.3 Open processed-data endpoints (third parties build on us)

No server, key, or permission needed. Pin a commit hash for reproducibility.

- Field bundles: `https://raw.githubusercontent.com/akashtori-13/drishti/main/spectrahunt-web/public/showcases/{3i-atlas,…,virgo-field}.json`
  (coords, story, epochs with MJD/band/PNG/provenance, per-detector bands)
- Measurements: `.../public/reports/{id}.json`
  (movers, variables, top σ, baselines, lightcurve[], 6-band spectrum[] ± err, known-object citations)
- Sky index: `.../public/coverage.json` (2,590 cells: epochs, images, bands, spans)
- Imagery: `.../public/cutouts/{id}_{epoch}.png`, `.../public/compare/{id}_{dss,2mass}.jpg`
- Embed: framing is blocked by `X-Frame-Options: DENY`; link out instead of `<iframe>` until an allowlist exists
- Snapshots: GitHub Releases carry versioned binaries; data snapshots ride git tags

Reuse policy: MIT + SPHEREx/IRSA attribution (DOI 10.26131/IRSA652). Weekly refresh
cadence keeps snapshots fresh. This is the award thesis in one line: **we don't just
consume open data — we measure it, publish every number back, and hand the universe
to anyone with a thirty-dollar phone.**
