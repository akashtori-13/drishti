# Brand assets

These files are presentation assets for the repository README and docs. They
are hand-authored SVGs plus references to **real** project imagery.

| File | Purpose |
| --- | --- |
| `hero.svg` | Animated banner: twinkling stars, rotating orbit ring, slow scan sweep. Pure CSS/SVG, with a `prefers-reduced-motion: reduce` guard that freezes all motion. |
| `logo-lockup.svg` | DRISHTI mark + wordmark. |
| `badges.svg` | Self-contained badge row (no external image requests). |

The README's screenshots come from `video/hf/assets/` (`app-home.png`,
`app-blink-3i.png`, `app-candidates.png`). Those are real captures of the app,
not illustrations. Science cutouts are real SPHEREx QR2 data served by IRSA via
`spectrahunt-web/public/cutouts/`.

When editing, keep the palette (`#05070f`, `#0a1226`, `#22d3ee`, `#fbbf24`,
`#e8edf7`) and the reduced-motion guard intact.
