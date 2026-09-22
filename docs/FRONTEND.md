# SpectraHunt Frontend Guide

Stack: Next.js 16 (App Router, **static export**), React 19, TypeScript,
zustand, canvas 2D (no WebGL, no Aladin). Styling: `src/app/globals.css`
(design tokens + view CSS, no component library).

## Routes (all real pages, prerendered)

| Route | File | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Hero + tutorial + how-it-works |
| `/intro` | `app/intro/page.tsx` | BORESIGHT orbital intro (Acts 1-2) → `/` |
| `/sky` | `app/sky/page.tsx` | Observer (default) / all-sky map toggle |
| `/blink/[id]` | `app/blink/[id]/page.tsx` | 15 IDs via `generateStaticParams`; unknown → branded 404 |
| `/blink/live?ra=&dec=&band=` | `app/blink/live/page.tsx` | Any visited field (Suspense + searchParams) |
| `/candidates`, `/about` | … | Cards, mission + tours + glossary |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | `*.ts` routes | `force-static` (required for export) |

Shared chrome (`SiteChrome`): `Header` (real `Link`s, active states),
footer (hidden on `/sky`), `Tutorial` (home only, localStorage once).

**Export gotcha:** nothing server-side may `await searchParams` — query state
is read client-side (`window.location.search` in effects, `useSearchParams`
only under `Suspense`).

## State (`lib/store.ts`)

UI-only zustand store: `compareMode`, `epochIdx`, `band`, `showMarkers`,
`tutorialDone`. No routing state (that's URLs now). `blinkURL(id, opts)` builds
`/blink/<id>?band=&epoch=&mode=`; live fields use `/blink/live?ra=&dec=&band=`.

## The two sky engines

Both draw **real** imagery with **verified orientation**:

| Surface | Truth | Rule |
|---|---|---|
| HiPS `Allsky.jpg` | tile **mosaic**, not a map | never used as one |
| hips2fits CAR full-sky | equirect, **RA increases LEFT** | hero + map draw **mirrored X**; overlay math stays RA-right |
| hips2fits SIN tiles | FITS-standard, verified on Orion/M42 | observer overlays use **mirrored gnomonic** (`sx = cx − x·scale`); inverse + drag signs flipped to match |

Shared constant: `SKY_ALLSKY_URL` (`lib/sky.ts`) — 2MASS CAR, log stretch.

- `HeroSky` — full-viewport CAR + coverage tint + hover readout + clickable
  blink-field markers (mini-map). Props: `grid, coverage, onInspect, markers?, onMarker?`.
- `CoverageMap` — same bg + TAP epoch tiles + graticule/labels + hover/select.
  Pure presentational; parent owns grid + selection.
- `StellariumView` — ground POV: hips2fits SIN JPEG per view (snapped tiles,
  two-stage preview, neighbor prefetch), canvas overlays (equatorial grid,
  88 constellation figures, Gaia stars by G mag, computed Sun + Moon+phase),
  Alt/Az from location (Dhaka default, GPS on demand) + live clock + time steps,
  cardinal ring, drag-look / wheel + pinch zoom, click-to-inspect with gnomonic
  inverse. Props: `focus, onInspect, initial, liveStars`.

## Blink workspace (`BlinkPage` + `BlinkComparator`)

Page layout (no page-scroll on desktop): title bar → viewer column (square
stage + transport row + filmstrip) + tweak column (View/Display/Bands/Measure
sections) + data rail tabs (Overview / Epochs / Catalogs / Share). Toolbar and
popovers were removed in favor of the always-visible side column.

`BlinkComparator` props: `frames, band, onBandChange, title, mode, onModeChange,
epochIdx, onEpochChange, showMarkers, onToggleMarkers?, fovArcmin?, onSample?,
center?, bandPngs?`. Internals:

- Canvas engine: cover-fit draw → stretch/colormap/invert (`lib/astro.ts`
  mirrors the backend render); modes blink/side/swipe/true-diff/motion-color.
- Preload is **progressive** (each arrival re-renders; placeholders meanwhile).
- `lib/motion.ts` — real in-browser differencing (MAD-noise ±5σ dipoles +
  vectors + variables) drives markers + Measure list. Offline-capable.
- Cursor probe: source-pixel sample + ≈ sky offset (mirrored signs!); click
  feeds `onSample` → spectrum/lightcurve in the rail.
- Histogram + diff-fraction drawn DOM-direct (no react-state churn).
- `⌘K`/`Ctrl+K` palette over ~25 commands; `?` guide; Esc closes.
- WebM via `canvas.captureStream` + MediaRecorder; PNG via `toDataURL`.
- Wheel: non-passive listener (no console warnings); reduced-motion disables autoplay.

## Orbital intro (`components/orbital/OrbitalIntro`)

Act 1 of BORESIGHT (`docs/ORBITAL_INTRO.md`): live SPHEREx + swarm on a real
terminator Earth. Props: `swarm, onEnter, onSkip` (+ optional texture/sprite
URL overrides, default `/orbital/*.webp`). Owns its RAF loop (refs-only
mutable state, ~20 fps, one static frame under reduced-motion); Earth +
terminator baked to an offscreen layer, `orthoProject` drives drawing and
picking alike. Free look: drag pans, wheel/pinch zooms about the cursor
(0.5–2.5×), double-click resets; arrows/±/0 work keyboard-first.
`IntroExperience` owns session gating + routing into `/intro`.

## Data layer (`lib/`)

- `showcases.ts` — `SHOWCASE_IDS` (20), static JSON fetch, `useLive` flag,
  `fetchLiveShowcase` (`/api/frames` → `Showcase`), `isLiveId`/`liveIdFor`,
  `API_BASE` export. `Showcase.bands` carries per-detector newest-visit PNGs.
- `astro.ts` — coordinate parse/format (decimal, sexagesimal, HMS/DMS),
  88 constellations, 102 LVF channels, stretch/colormaps, motion math,
  permalinks, CSV, `mjdToDate`.
- `catalogs.ts` — SIMBAD-first resolve, SkyBoT/MPC/Horizons/SIMBAD/IRSA link
  builders, surprise fields, tours, glossary.
- `skycache.ts` — IndexedDB imagery + neighbor prefetch, localStorage JSON
  (lines, per-view stars, LRU-capped), `loadCachedImage`.
- `motion.ts` — see above.
- `orbit.ts` — hand-ported near-earth SGP4 (zero deps) + WGS-84 sub-point,
  Sun/subsolar math, `(approx)` boresight proxy, cache-first
  `/data/tle-bundle.json` swarm loader. Deep-space/low-inclination refused
  honestly.

## Conventions for contributors

- Client components start with `'use client'`. No new runtime deps without
  discussion (bundle budget < 10 MB; currently ~3.3 MB).
- Canvas overlays: always derive from the same math as clicks (hover =
  inverse of draw). When touching any projection, re-verify against a real
  frame (see `SYSTEM_DESIGN.md` §7) — never assume orientation.
- Honesty UI: missing data renders as missing (`png:null` tiles, dark cells,
  `detail` strings). Never synthesize pixels or numbers.
- Accessibility: `role`/`aria-label` on canvases and custom controls,
  keyboard parity (Space/arrows/Ctrl+K/Esc), visible focus, `prefers-reduced-motion`,
  ≥44 px targets, `alt`/labels on thumbs.
- Lint is law: `npx eslint src` 0 errors, `tsc --noEmit` clean — CI and the
  overnight loop both enforce it.
