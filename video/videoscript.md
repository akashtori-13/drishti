# DRISHTI: 240 Seconds of Glory
**NASA Space Apps Challenge — Pitch Script · Four-Act · 2026-09-27**
**Target runtime: 4:00 (240 seconds)**

> Draft 2 — judge fixes applied: no invented waste tuple, no absolutes, 3-spoken montage, control-star qualifier, new closer, 3 static end cards, ~390 spoken words.

---

## Act I · Who — The Plates (0:00–0:45)
**Objective:** Stakes in the first 10 seconds. Team + dataset + access split into short lines.

> **VISUAL:** Black. Two hands hold printed SPHEREx frames, flip them click-click. Match-cut to DRISHTI blinking the same field. Lower-thirds: names, one at a time.

**[FAST]**

A thousand stars stayed put. One moved — and it became Pluto.

*[beat]*

In 1930, a twenty-four-year-old in Flagstaff blinked two plates, night after night, for months, by hand.

**[SLOW]**

We're Team AKASHTORI. SPHEREx photographs the whole sky every six months in 102 infrared colors. Nobody can blink all of that by hand. So we built DRISHTI: it blinks SPHEREx Quick Release 2 from the NASA/IPAC Infrared Science Archive. In a browser. On a phone. No login.

> **ANCHOR:** A thousand stars stayed put. One didn't.

---

## Act II · Why — The Drift (0:45–1:45)
**Objective:** Villain is geometry. Honest waste framing — idle comparisons, not deleted data.

> **VISUAL:** Hand slides rainbow strip over pixel grid. Timeline dots dim to idle — none leave the archive.

**[SLOW]**

SPHEREx has no moving prism. Each pixel stares through a different tint on a rainbow window glued to the detector. So the same star looks bluer on one side of the photo and redder on the other.

Shift a little each revisit, and the star lands on a new tint. Nothing is deleted — the archive keeps it all. What gets lost is narrower: under same-colour rules, visit after visit can't be fairly compared, so good data sits idle for that question.

**[FAST]**

That idle is the waste. The drift is nobody's fault. It's the price of an all-sky rainbow.

> **ANCHOR:** We keep every visit we can trust — flagged pixels out.

---

## Act III · What — The Tool (1:45–3:00)
**Objective:** Demo sprint. Comet, trimmed montage, rigor story with control qualifier, static visitor.

> **VISUAL:** UI-in-hand. Tap the 3I/ATLAS chip. Difference mode: field cancels to gray, one remnant pops with A→B vector. Hold 3 silent seconds.

**[FAST]**

This is only the third known visitor from another star. Watch it move — everything else stands still. A fixed stare misses it — it races two-and-a-half degrees in five days. So we chase it with NASA's Horizons track, and measure where it lands, error bars and all.

**[MONTAGE — 3 spoken allies, ~7s]**

And it isn't working alone. Every position gets cross-checked — SPHEREx sees it. Gaia pins the stars. Horizons says where it should be.

*[SILENT STAMPS — SIMBAD, SkyBoT (labeled degraded), CelesTrak, DSS, Yale — lower-thirds only, ~2.5s]*

**[SLOW]**

Now the part most teams won't show you. Our pipeline once flagged a control star — 28.9 sigma colour change. We checked the pixels: flagged detector pixels. Contamination, not sky. We killed the claim, shipped the fix, withdrew the verdict.

*[beat]*

We'd rather say "don't know" than publish a ghost. The visitor stands as measured: six colours, honest error bars, seven pair tests, all static. No outburst claimed.

> **ANCHOR:** A difference is only a discovery once the detector is ruled out.

---

## Act IV · So What & Next — The Sky (3:00–4:00)
**Objective:** Scale, reuse pointer, open experiment, closing line, static end cards.

> **VISUAL:** 2,590-cell census map, dice roll, σ-ranked cards. Phone held up: airplane mode ON, timeline blinks from cache. QR + repo URL held 5 seconds.

**[FAST]**

Twenty fields, 143 epochs — every measurement public JSON. Star catalogs, nebulae, constellations, cached satellite tracks. No login, no wifi, one thumb — watch. Reuse it tonight: repo on screen, MIT, offline app, schema in the readme.

**[SLOW]**

One experiment is still open, and we're saying so on the label: whether colours agree across detector pairs. Either way we learn — a negative result gets reported too.

*[long pause — let the room go quiet]*

> **FINAL SPOKEN WORDS — hold, then black:**
> Tombaugh blinked two plates. We blink 143 epochs — and keep every pixel.

**END CARDS (static, no narration):**
- Card 1 (4s): DRISHTI / Team AKASHTORI / Space Apps 2026 / 143 epochs · 240 cutouts · public JSON + repo URL + QR.
- Card 2 (6s): SPHEREx/IRSA QR2 DOI 10.26131/IRSA652 + QR3 …662, then Gaia / SIMBAD / Horizons / SkyBoT / CelesTrak / DSS-2MASS / Yale.
- Card 3 (5s): Negative results reported too · SkyBoT degraded, labeled · nebula art marked · subtitles on.

---

## Data & Sources Manifest — *not spoken, end-credits crawl*

| Source | What we use | Credit / DOI |
|---|---|---|
| SPHEREx/IRSA QR2 | Spectral images, TAP, IBE cutouts | DOI 10.26131/IRSA652 |
| SPHEREx/IRSA QR3 | New-epoch coverage where present | DOI 10.26131/IRSA662 |
| ESA Gaia DR3 | Star positions, magnitudes | Credit, Mission page |
| CDS SIMBAD / Sesame | Object identity, coordinate resolve | Credit |
| NASA/JPL Horizons | Small-body ephemerides (geocentric) | Credit |
| IMCCE SkyBoT | Moving-object cone search (degraded — labeled) | Credit |
| Minor Planet Center | Checker links (no fetch) | Mentioned |
| CelesTrak (via mirror) | TLE sets, checksummed, freshness-gated | Credit |
| CDS 2MASS / DSS HiPS | All-sky + context imagery | Credit |
| Yale Bright Star Catalog v5 | 1,627 stars (V≤5.0) home layer | Credit |
| Messier/NGC positions | 16 nebula anchors (rendering artistic) | Code honesty contract |
| Constellation lines (d3-celestial) | Sky overlays, search | Credit |
| Popular targets (ours) | 1,119 curated entries, SIMBAD-verified | Method in repo |
