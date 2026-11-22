# Design Spec — DRISHTI repo professional polish (docs + branding)

- **Date:** 2026-11-22
- **Scope:** A — Docs + branding (approved by user)
- **Repo:** `F:/NSAC-2026/drishti`
- **Status:** Design approved; awaiting implementation plan

## 1. Goal

Turn the DRISHTI repository into a professionally presented, easy-to-navigate
project: an "awesome" README, a documentation index, a small authored brand/icon
asset set, and an animated hero — all using **real** project imagery. No changes
to application source code (`spectrahunt-web/src`, `backend/`, `scripts/`, etc.).

## 2. Non-goals

- No UI behaviour changes, no new app features, no dependency changes.
- No generated/fabricated science imagery. The repo honesty rule
  (`AGENTS.md`) requires every pixel to trace to IRSA data or be labelled.
- No push to GitHub. Commit locally on `main` only (unless user asks later).
- No moving, renaming, or deleting existing files (link breakage risk).

## 3. Precondition (done)

Local `main` was 81 commits behind `origin/main`. It was fast-forwarded
`c0f5fe1 → 6da62e8` with `git pull --ff-only`. The pre-existing uncommitted
change to `spectrahunt-web/package-lock.json` was verified untouched by the
incoming commits and is preserved as a working-tree modification. It will NOT
be staged in the design/implementation commits.

## 4. Asset inventory (all real, no generation needed)

| Asset | Path | Use |
| --- | --- | --- |
| App home screenshot | `video/hf/assets/app-home.png` | README hero / gallery |
| Blink screenshot | `video/hf/assets/app-blink-3i.png` | gallery |
| Candidates screenshot | `video/hf/assets/app-candidates.png` | gallery |
| Blink comparator still | `video/hf/assets/blink-comparator.jpg` | secondary visual |
| All-sky map | `video/hf/assets/allsky.jpg` / `spectrahunt-web/public/data/allsky.jpg` | coverage visual |
| Mission hero | `spectrahunt-web/public/about/spherex-hero.webp` | brand backdrop |
| App mark | `spectrahunt-web/public/icons/mark.svg`, `app-icon-dark.svg` | logo basis |
| Orbital textures | `spectrahunt-web/public/orbital/*.webp` | optional hero accent |

Referenced via relative paths from `README.md` — works on GitHub and offline.

## 5. Deliverables

### 5.1 `README.md` (rewrite, keep all technical substance)

Structure, top to bottom:

1. Centered brand lockup (SVG mark + DRISHTI wordmark) and one-line tagline.
2. Animated hero banner (`assets/brand/hero.svg`) composed over a real
   mission/app image; CSS/SVG motion only, reduced-motion safe.
3. Local SVG badge row (MIT, NASA Space Apps 2026, SPHEREx/IRSA QR2, Next.js,
   FastAPI, PWA) — self-contained, no external image requests.
4. "One-line value prop" + 3-click flow (Home → field → blink slider).
5. **Gallery** of 3 real screenshots in a responsive HTML table/grid: Home,
   Blink, Candidates — each captioned with its real data source.
6. Feature grid with SVG icons (search/sky/blink/measure/candidates/mobile).
7. Retain: architecture mermaid diagrams, data pipeline, data rules, how-deep,
   data-reuse, quick start, mobile/desktop, repository map, checks, citation.
8. Documentation links section pointing at `docs/README.md`.
9. Honesty + citation callout at the bottom.

Writer rules: keep sentences short; no emoji; arrows (`→`) are acceptable
typographic glyphs; all section anchors from the old README preserved where
reasonable; every image has descriptive `alt` text and a provenance caption.

### 5.2 `docs/README.md` (new — documentation index)

Single table grouping existing docs by audience:
- Start here: `README.md`, `DEMO.md`, `docs/GUIDE.md`
- Design: `SYSTEM_DESIGN.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`
- Operations: `docs/OPS.md`, `docs/PIPELINE.md`, `docs/TROUBLESHOOTING.md`,
  `docs/DISTA-READINESS.md`
- Reference: `docs/API.md`, `docs/VIDEO.md`, `docs/CLASSROOM.md`,
  `USEOFDATA.md`, `DISTAcontext.md`, `CONTRIBUTING.md`, `resume.md`
- Brand/spec: `docs/superpowers/specs/*`

Each row: document, purpose, audience. No content changes to linked docs.

### 5.3 `assets/brand/` (new)

- `hero.svg` — self-contained animated SVG: subtle star twinkle, slow orbit
  ring, scan sweep. `<style>` includes `@media (prefers-reduced-motion:
  reduce)` to freeze all animation. Viewport 1200×360. Text kept minimal
  (wordmark rendered by README HTML, not baked into SVG, for accessibility).
- `logo-lockup.svg` — mark + wordmark, monochrome-friendly.
- `README` usage note (short) describing what the assets are and that the
  screenshots are real captures from the app.

### 5.4 `assets/icons/` (new)

Hand-authored 24×24 stroke SVG icons on a consistent grid, `currentColor`
stroke, no emoji, no external font: `search`, `sky`, `blink`, `measure`,
`candidates`, `mobile`, `download`, `database`, `orbit`, `book`.

### 5.5 Emoji cleanup (targeted)

Replace true emoji glyphs with text or local SVG in documents we already
touch: `ARCHITECTURE.md` (✅), `SYSTEM_DESIGN.md` (arrows are fine; check for
✅), `skills/landing-page-design/SKILL.md` (✅/❌). Do not strip typographic
arrows. Do not touch vendored third-party skill bodies beyond glyph swap.

## 6. Visual system

- Palette: deep space navy `#05070f` / `#0a0f1f`, electric cyan `#5eead4`,
  warm signal amber `#fbbf24`, text `#e8edf7` / muted `#94a3b8` — chosen to
  echo the existing app's space aesthetic.
- Type: system UI stack (no network fonts). Monospace for numbers/commands.
- Motion: durations 3–12s, low amplitude, always paired with reduced-motion
  guard. No flashing (accessibility).
- Icons: 1.75px stroke, rounded caps, 24×24 viewBox.

## 7. Verification

1. `git diff --check` — no whitespace errors.
2. Scan changed files for emoji (script) and for external image URLs.
3. Check every relative link/image path in `README.md` and `docs/README.md`
   resolves to a real file.
4. Confirm no application source file is modified:
   `git status --porcelain` limited to expected paths.
5. Confirm `prefers-reduced-motion` guard present in `hero.svg`.
6. Commit only intended paths (never `package-lock.json`).

## 8. Commit plan

- Commit 1 (now): this spec document.
- Commit 2 (after implementation): README + docs index + brand/icon assets +
  emoji cleanup, message `docs: professional repo presentation and branding`.

No push. Final report to user includes commit hashes and verification results.
