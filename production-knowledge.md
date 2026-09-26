# DRISHTI — Content Production Team Knowledge

Hand this file plus `docs/VIDEO.md` (240s beats), `DEMO.md` (demo script),
`docs/CLASSROOM.md`, `docs/ONEPAGER.md`, and `README.md` to anyone filming,
editing, or designing for Team AKASHTORI. No prior context needed. Nothing in
here requires an engineering background — numbers first, then what to point a
camera at.

Companion docs: `docs/VIDEO.md` = the shot-by-shot 240s plan. This file = the
facts behind it. `README.md` = the full project brief if you want depth.

## 1. Say these exact things

- **Full name:** DRISHTI — SPHEREx Transient Explorer & Light-spectrum
  Large-scale Archival Repository. Team AKASHTORI, NASA Space Apps Challenge 2026.
- **One line:** "NASA's SPHEREx telescope re-photographs the entire sky every six
  months in 102 infrared colors. DRISHTI lines up each visit so anyone can blink
  between them."
- **Category line:** "Best Use of Data: we don't just consume open data — we
  measure it, publish every number back as open JSON, and hand the universe to
  anyone with a thirty-dollar phone."
- **Dataset line (say on camera):** "SPHEREx Quick Release 2 from the NASA/IPAC
  Infrared Science Archive, with DSS and 2MASS sky context from CDS Strasbourg,
  star matches from ESA Gaia DR3, and names from SIMBAD."
- **Challenge:** name the exact 2026 challenge title on camera (ask the team —
  it must match the project page word for word).

## 2. Numbers board (all real, all safe to put on screen)

20 fields · 143 blink epochs · 20/20 measured reports · 2,590 mapped sky cells ·
102 spectral channels · 6 detectors · 8 data sources · <15 MB budget (~11 MB) ·
4 platforms, one codebase · top detection 143σ (3I/ATLAS) · ground truth 9/9
known targets within 0.3 arcminutes · 82 automated tests (24 + 58).

## 3. What to show (feature → how to demo → shot)

- **First blink:** home → 3I/ATLAS chip → drag timeline → Play. *Shot: screen
  recording, finger drag visible, Aug vs Dec 2025 labels legible.*
- **Difference mode:** same view → Diff. Stars melt to gray, comet remnant pops.
  Toggle Movers for the A→B arrow. *Shot: full-screen capture, pause on the pair.*
- **Light curve + spectrum:** click any bright spot → Overview tab graphs.
  *Shot: close-up of the curve drawing, then the 6-band spectrum.*
- **Sky map:** drag to pan, scroll to zoom, tap a point → inspector → "open blink".
  *Shot: continuous pan across the Milky Way band, then a tap.*
- **AR point-at-sky:** hold the phone up, pan across the room, sky follows;
  compass/elevation HUD visible. *Shot: over-the-shoulder, phone + real room.*
- **Offline proof:** airplane-mode toggle ON → app keeps blinking. *Shot: film
  the toggle itself, then the working app. This is the money shot.*
- **Dice:** Surprise me → unknown field opens directly. *Shot: genuine reaction,
  don't rehearse the result.*
- **Candidates:** filter chips, σ-ranked cards, CSV download. *Shot: quick scroll
  + one card held on screen.*
- **Share link:** copy link → paste in fresh tab → same view restores.
  *Shot: split-screen if possible.*

## 4. Demo flows (pick one per take)

**A. The 60-second hook:** chip → Play → Diff → Movers arrow → σ readout.
**B. The explorer:** sky map pan → tap → blink → spectrum → share link.
**C. The robustness story:** AR pan → airplane mode → dice roll → candidates.
Always end on the category line (§1).

## 5. Credits that MUST appear (video description + end card)

SPHEREx/IRSA (IPAC) · CDS Strasbourg (DSS2, 2MASS, HiPS, SIMBAD) · ESA Gaia DR3 ·
IMCCE SkyBoT · JPL Horizons/MPC · CelesTrak TLE · d3-celestial mirror (ofrohn) ·
AWS Open Data · Google Fonts · every team member by name · DOI 10.26131/IRSA652.

## 6. Rules (lose marks if broken)

Under 240 seconds (over-length gets cut). Name every member. English subtitles.
No under-18 faces/voices/names. Demo, never slideshow-about-a-demo. Test every
link (repo, video, release) in a private window. Finish docs alongside the video.

## 7. Glossary for editors (one line each)

- **Epoch:** one dated visit to the same sky. Blinking = comparing epochs.
- **Band:** one slice of infrared color (6 detectors × 17 channels = 102).
- **Diff:** epoch B minus epoch A; still things cancel, movers pop.
- **σ (sigma):** significance score — 143σ means undeniably real.
- **Light curve:** brightness vs time for one spot.
- **Same-band rule:** we only compare matching colors (physics demands it).

## 8. Common mistakes

- Don't call it AI/ML — it's measurement + visualization. Say "measured".
- Don't claim live data — it's a weekly snapshot plus on-demand live mode.
- Don't show the orbital intro as the product — it's the front door; the blink is the product.
- Don't invent numbers — every stat in §2 traces to the repo; ask before adding any.
