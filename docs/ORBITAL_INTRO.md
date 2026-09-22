# Concept: "BORESIGHT" — the orbital intro

Working name: **BORESIGHT** (the line a telescope is actually pointing along — and the
thing the user clicks to look through).

One-sentence pitch: *You arrive in orbit. The real SPHEREx is circling a real Earth,
right now, and you are watching its telemetry. You click the spacecraft — the frame
tears, glitches, and swallows you — and you land inside the instrument, where the whole
site is the spacecraft's console: what it sees, what it found, what it's doing next.*

This is the site's single strongest authored moment (per `build-awwwards-quality-sites`),
and it obeys the repo's prime law: **every number on screen is real or honestly labeled.**

---

## Act structure

### ACT 1 — The Vigil (arrival)

**Realism bar: cinematic, not diagrammatic.** SPHEREx is not a dot — it's a rendered
spacecraft (the distinctive triple nested photon-shield cones, 20 cm telescope, solar
wing; ~2.6 m tall, 3.2 m wide), seen from a camera parked just off its orbit, Earth
looming huge below. The swarm stays as dim points — at this camera distance that's the
*physically correct* look, and the contrast (one crafted machine vs. a field of dust)
is the composition.

**How we get "highly realistic" inside a Canvas-2D, no-WebGL, offline project:**

- **SPHEREx spacecraft** — pre-rendered turntable, not runtime 3D. Build/trace a model
  from official NASA/JPL references (public domain), render in Blender with the correct
  SSO lighting (Sun near the terminator — matches the scene's real Sun geometry), export
  a slow-rotation loop as WebM-on-black or a WebP sprite sheet (~120 frames).
  Composite in canvas with `globalCompositeOperation: 'lighter'` — the black background
  vanishes, speculars bloom naturally. ~1–1.5MB for the loop. The craft drifts on a slow
  spring so it never reads as a video on loop.
- **Earth** — NASA Blue Marble (day) + Black Marble (night city lights) textures drawn
  as a shaded sphere: real day/night terminator from the computed solar direction,
  soft atmosphere rim (2-layer radial glow), faint cloud layer (NASA cloud imagery,
  slow drift). All public domain, all bundled — works offline.
- **Lighting continuity** — the terminator on Earth, the key light on SPHEREx, and the
  boresight direction all derive from the *same* computed Sun position. One source of
  truth; nothing looks pasted-on. (Invisible-correctness principle, `emil-design-eng`.)
- **Fallback ladder** — WebM-alpha → sprite sheet → single hero still → dim point
  (low-power/reduced-data devices). The scene degrades, never breaks.

Budget check: Earth textures ~600KB (WebP, downscaled — it's a backdrop), SPHEREx loop
~1.2MB, TLE bundle ~150KB → ~2MB total added, still under the 10MB cap with the current
~3.3MB. If we ever *must* have free camera movement, the only justified exception is a
lazy-loaded WebGL intro module with the canvas-2D render as fallback — but the
pre-rendered path is the default: 90% of the realism at 5% of the cost and zero
runtime risk.

Visual: near-black `#05060c`. Earth below, night-side city lights faint, day/night
terminator computed from the real Sun position. **Earth is not empty: a swarm of real,
tracked satellites orbits it** — hundreds of dim dust-points on real orbits (curated
CelesTrak TLE set, propagated live). Among them, one point burns brighter, wrapped in a
hairline bracket, labeled: **SPHEREx** — on its real sun-synchronous polar orbit
(~700 km, ~97° inclination, 90-min period), position from live SGP4 propagation.

The crowd is the point: *thousands of machines up there, and you're here for the one
that sees in 102 colors.* Satellite-tracker sites (stuffin.space, N2YO — which tracks
35,384 objects) trained users to read this scene instantly; we borrow the grammar and
spend the attention budget on the one highlight.

Swarm interaction grammar:
- Hover any satellite → dim mono name tag (`STARLINK-31122`, `NOAA 19`, `HST`…).
- Click a non-SPHEREx satellite → bracket flickers, a one-line whisper:
  `Not this one. That one sees in 102 colors.` + a nudge arc pointing at SPHEREx.
  (Charming dead-end, never a modal.)
- SPHEREx gets: pulsing `drawBracket` bracket, spectrum-tinted ground-track trail
  (`--b1→b6` gradient along its path), and the breathing invitation.

Screen furniture (all dim, Geist Mono, `--ink-3` at ~60%):

```
SPHEREX · NORAD 63182 · 2025-047E       MJD 60945.38291
ALT 699.4 KM · V 7.50 KM/S · INC 97.4°  (live TLE, epoch 26264.69)
SUB-POINT  12.44°N  88.10°E
BORESIGHT  RA 187.32°  DEC +58.91°  (approx)
TRACKED OBJECTS 847 · SCANNING · QR2
```

And the invitation, dim, slowly breathing (opacity 0.35 → 0.6, 4s):

> **Click SPHEREx to see what it's doing.**

Cursor becomes a crosshair near the spacecraft. Nothing else moves fast.
The mood is *surveillance-room calm*: you stumbled onto a live feed.

Honesty notes (mandatory):
- All positions: real, from TLEs (CelesTrak) propagated with SGP4 in-browser; TLEs
  cached in IndexedDB with a bundled last-known set in `/public/data/tle-bundle.json`
  so it works offline. TLE epoch shown on screen — honest staleness.
- Swarm size: curated ~400–800 objects (stations, science, weather, bright visual
  pass objects + SPHEREx's Falcon 9 siblings). Full catalog (35k+) would break the
  bundle budget and the calm; curation is a design choice, labeled as such
  (`TRACKED OBJECTS 847` shows the real rendered count, not the catalog total).
- Boresight RA/Dec: SPHEREx scans great circles ~perpendicular to the Sun direction, so
  we *approximate* boresight from orbit + solar geometry and label it `(approx)`.
  If we can't compute it, we show the sub-point only. Never a fake precise number.
- This extends the existing Live rule, not breaks it.

### ACT 2 — The Tear (click → glitch zoom)

Sequence (~1.1s total, interruptible by a second click = skip to end):

1. **0–350ms — Lock-on.** Bracket snaps tight, telemetry flickers to `TRACKING`,
   camera dollies toward the spacecraft (scale spring, `linear()` ease, overshoot 1.06).
2. **350–800ms — The tear.** The frame destabilizes: RGB channel split (2–6px,
   oscillating), horizontal slice displacement (8–16 random rows shift ±x), scanline
   interference, a white-frame flash at ~700ms. Sound: none (autoplay audio is hostile).
3. **800–1100ms — Through the aperture.** Scale punches *through* the spacecraft
   (scale 12 → 40, exposure rises), glitch dissolves into streaks that align into…
   the real sky. The user has traveled *down the boresight*.

Implementation: single canvas post-pass. Render the orbit scene to an offscreen canvas,
then composite with slice/channel offsets — no WebGL, fits `canvas-sky-engine` budget
rules (zero per-frame allocation, one RAF, reduced-motion variant = plain crossfade).
Route change to `/` (or `#entered`) happens under the flash so the glitch hides the swap.

### ACT 3 — The Console (the existing home, reframed)

The user lands in the current Home — but now it reads as **the spacecraft's own console**,
because the hero already *is* what SPHEREx sees (the real 2MASS infrared sky).

Deltas to current Home:
- A 600ms "system wake" stagger on the chrome: nav island, search ring, stats band —
  40ms stagger, `ease-out-expo`, like instrument panels powering up.
- Hero kicker changes register: from marketing voice to console voice:
  `LIVE FEED · 102 CHANNELS · ALL SKY` (real claims only).
- The featured-detection carousel becomes "Recent captures" — the same real data,
  reframed as the instrument's latest findings.
- The numbers band becomes telemetry-styled (it already is mono; tighten with
  hairline rules and `LEVEL_COLORS` accents).
- A one-time toast, dim: `You are looking at the actual survey sky. Click anywhere.`

---

## Why this wins (skill-grounded)

- **build-awwwards-quality-sites**: hero = strongest authored moment; motion has a
  narrative role (surveillance → breach → inside); no decorative motion.
- **animate / apple-design**: the transition is designed in the right order — purpose
  (you crossed into the instrument), then properties (scale+post-fx, interruptible),
  then spring constants; exit is fast; reduced-motion = immediate cut.
- **frontend-design / taste-skill**: one extreme, committed — *classified monitoring
  terminal*, not "space website with stars". No neon glow, no purple gradient, no pure
  black. Dominant near-black + sharp spectrum accents (`--b1..b6`) only at data.
- **landing-page-design**: the intro has ONE job — the click that enters. No competing
  CTAs. Everything dim except the one thing to click.
- **spectrahunt-ui honesty rule**: TLE-propagated position, labeled approximations,
  cached + bundled fallback. The magic trick is that *it's all real*.

## Interaction & edge rules

- Intro plays once per session (`sessionStorage sh-entered`); returning visits land
  directly on Home. Deep links (`/sky`, `/blink/…`) never see the intro.
- `Skip intro` (Esc too) visible from first paint, ≥44px target.
- `prefers-reduced-motion`: no orbit loop (static frame, real numbers), click = instant
  crossfade to Home.
- Mobile: same scene, simplified (no ground-track trail, coarser Earth), ≤2s to
  interactive.
- Offline: bundled TLE + bundled Earth texture; everything still works.
- Bundle cost target: < 400KB added (Earth texture WebP ~200KB, TLE ~2KB, SGP4 ~8KB
  hand-ported — no satellite.js dep unless we accept its size).

## Open brainstorm (variations worth considering)

1. **Exposure heartbeat** — SPHEREx images continuously; a soft flash + counter tick
   every N seconds ("exposure 14,204 · 102 channels"), each linking to a real blink.
2. **Ground-track cinema** — the orbit trail paints where it's been; hovering the trail
   shows "surveyed this pass" cells (ties to real coverage.json!).
3. **Night-side first** — intro always shows Earth's night side toward the terminator
   (SPHEREx avoids the Sun); more cinematic *and* more true.
4. **The long way in (alt)** — instead of a hard glitch, a 3-second fall through the
   detector stack: 6 band-separated ghost layers of the same sky (bands 1→6 colors)
   collapsing into the hero. Slower, more majestic, riskier for impatience.
5. **Monitoring-station alt** — instead of orbit, you're in a dark control room looking
   at the feed on a wall of glass panels. Cheaper to build, less "wow".
6. **Seasonal re-entry** — the intro returns only when a *new* quick release drops
   ("QR3 live — re-enter"), making the gate meaningful instead of annoying.

## Build order (when we start)

1. `lib/orbit.ts` — TLE fetch/cache/bundle + SGP4 propagation + sub-point/approx
   boresight + terminator math. Unit-testable pure functions (vitest).
   Includes the curated swarm set (`tle-bundle.json`, ~400–800 objects, ~150KB).
2. `components/orbital/OrbitalIntro.tsx` — Act 1 canvas scene (Earth + swarm + orbit +
   telemetry).
3. `components/orbital/GlitchTransition.tsx` — Act 2 post-pass + route swap.
4. Home deltas (Act 3 wake stagger, console copy, toast).
5. Reduced-motion/mobile/offline passes; eslint + tsc + build gates; bundle audit.

---

## Asset status (prepared 2026-09-22, in `assets/orbital/`)

- `tle/spherex.json` + `tle/swarm.json` — real AFSPC TLEs (via N2YO; CelesTrak blocked
  from the build network): SPHEREx (NORAD 63182, 2025-047E) + 16 curated swarm objects
  incl. all four PUNCH rideshare siblings, ISS, CSS, HST, Terra, Aqua, Suomi NPP,
  NOAA-19/21, GOES 13, Landsat 8, Sentinel-2A, Jason 3.
- `earth/` — NASA Blue Marble day (2048×1024), Black Marble night lights (2048×1024),
  clouds (1024×512), web-optimized WebP in `earth/web/` (~420KB total). Plus the two
  NASA-3D-Resources Earth plates (topo map + Apollo-style photo) as alternates.
- `reference/` — official NASA/JPL artist concepts PIA26531/26532/26533 + cleanroom
  photos (concentric cones, outer photon shield, telescope, work stand) — the model
  was traced from these.
- `model/spherex.glb` + `spherex.npz` — procedural SPHEREx model (22 meshes, 3,260 tris,
  PBR metallic-roughness materials), built by `scripts/spherex_model.py`.
- `render/` — software-rendered turntable: 48 frames @ 512² + 8×6 sprite sheet
  (`spherex_turntable.webp`, 268KB) + `poster.webp`, built by
  `scripts/render_turntable.py` (numpy rasterizer: z-buffer, Blinn-Phong with corrected
  dielectric F0=0.04, Fresnel rim, sun key + earthshine fill).

Re-render after any model tweak: `python scripts/spherex_model.py && python
scripts/render_turntable.py --frames 48 --size 512`.