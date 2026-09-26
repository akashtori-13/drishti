# DRISHTI: 240 Seconds of Glory
**NASA Space Apps Challenge — Pitch Script · Four-Act · 2026-09-27**
**Official timing: WHO 45s / WHY 60s / WHAT 60s / SO WHAT 75s. Total with cards: under 240s.**

> Draft 3 — NSAC-aligned: official act slots, [CHALLENGE] slots for Sep-17 summaries, spoken roster, continuous-take demo, fixed closer, full-DOI cards.

---

## Act I · WHO — The Plates (0:00–0:45, ~100 words)
**Objective:** Stakes in 10s, spoken names + roles, challenge slot, dataset line.

> **VISUAL:** Black. Two hands hold printed SPHEREx frames, flip them click-click. One continuous take whips to phone running DRISHTI on the same field — no cut. Lower-thirds: full names, one at a time. Card: [CHALLENGE].

**[FAST]**

A thousand stars stayed put. One moved — and it became Pluto.

In 1930 Tombaugh blinked two plates by hand, night after night.

We're Team AKASHTORI — I'm Himel Das, systems; Zubayer Hasan Shaad, tech; Md Hedayet Ullah, research; Md Mahdin Al Abrar, communications; Aazmaine Alif Abrar, quality; Suraiya Ratry Orni, science review — for [CHALLENGE].

**[SLOW]**

SPHEREx photographs the whole sky every six months in 102 infrared colors. Nobody can blink all that by hand. So we built DRISHTI: it blinks SPHEREx Quick Release 2 from the NASA/IPAC Infrared Science Archive, in a browser, on a phone. Here's the catch.

> **ANCHOR:** A thousand stars stayed put. One didn't.

---

## Act II · WHY — The Drift (0:45–1:45, ~140 words)
**Objective:** Villain is geometry. Honest idle framing, no invented tuple.

> **VISUAL:** Hand slides rainbow strip over pixel grid. Timeline dots dim to idle — none leave the archive.

**[SLOW]**

SPHEREx carries no moving prism. A rainbow filter is glued to the detector, so each pixel sees in one of 102 infrared colors. Same star, left side looks bluer, right side looks redder.

Revisit shifts a little, star lands on a new tint. The archive still holds those visits. But same-colour rules mean visit after visit can't be fairly compared, so good data sits idle for that question. And when the detector flags a pixel, we set it aside — we don't use what we can't trust.

**[FAST]**

That idle is the waste. The drift is nobody's fault. It's geometry — the price of an all-sky rainbow.

> **ANCHOR:** The drift is nobody's fault. It's geometry.

---

## Act III · WHAT — The Tool (1:45–2:45, ~120 words)
**Objective:** One continuous take: comet demo, 3 allies, control-star kill, static verdict.

> **VISUAL:** Continuous single take, UI-in-hand. Tap the 3I/ATLAS chip → difference mode: field cancels to gray, one remnant pops with A→B vector. Hold 3 seconds silent. URL visible throughout.

**[FAST]**

This is only the third known visitor from another star. Watch it move — everything else stands still. It races two-and-a-half degrees in five days, so a fixed stare misses it. We chase it with NASA's Horizons track, and measure where it lands, error bars and all.

Every position gets cross-checked — SPHEREx sees it. Gaia pins the stars. Horizons says where it should be.

*[SILENT STAMPS — SIMBAD, SkyBoT (labeled degraded), CelesTrak, DSS, Yale — lower-thirds only]*

**[SLOW]**

Now what most teams won't show you. Our pipeline once flagged a CONTROL star — 28.9 sigma colour change. We checked the pixels: flagged detector pixels. Contamination, not sky. We killed the claim, shipped the fix.

*[beat]*

We'd rather say don't know than publish a ghost. The visitor stands as measured: static, with honest error bars. No outburst claimed.

> **ANCHOR:** A difference is only a discovery once the detector is ruled out.

---

## Act IV · SO WHAT & NEXT — The Sky (2:45–4:00, ~170 words + 15s cards)
**Objective:** Who-benefits, spoken repo + QR, open experiment + ask, fixed closer, 3 static cards inside 240s.

> **VISUAL:** 2,590-cell census map, dice roll into unknown field, σ-ranked cards. Phone held up: airplane mode ON (toggle visible), timeline blinks from cache. Repo URL + QR held 5 seconds.

**[FAST]**

Twenty fields, one hundred forty-three epochs — every measurement public JSON. Two thousand five hundred ninety sky cells mapped, two hundred forty cutouts cached — one thumb to play them. A classroom with one phone, no wifi, can blink the same sky we do, offline, tonight.

The code is MIT at github dot com slash akashtori-13 slash drishti — on screen now, QR held. Schema's in the readme — reuse the JSON in any app.

**[SLOW]**

One experiment is still open: do colours agree across detector pairs? We report negatives too — and we need you: blink a new field offline, send us where we disagree.

*[long pause — let the room go quiet]*

> **FINAL SPOKEN WORDS — hold, then black:**
> Tombaugh blinked two plates. We blink 143 epochs — and keep every visit we can trust.

**END CARDS (static, no narration, inside 240s):**
- Card 1 (4s): DRISHTI / Team AKASHTORI — all six names + roles / Space Apps 2026 / 143 epochs · 240 cutouts · public JSON + repo URL + QR / MIT · offline-capable · no login.
- Card 2 (6s): Data — SPHEREx/IRSA QR2 https://doi.org/10.26131/IRSA652 / QR3 https://doi.org/10.26131/IRSA662 / ESA Gaia DR3 · CDS SIMBAD/Sesame + 2MASS/DSS · NASA/JPL Horizons (geocentric) · IMCCE SkyBoT / MPC checker links only / CelesTrak via mirror (checksummed) / Yale BSC v5 / d3-celestial / Messier-NGC (artistic render).
- Card 3 (5s): Negative results reported too · SkyBoT degraded, labeled · nebula art marked · replay labeled simulation · no AI sky imagery · no stock footage · subtitles on.

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

## Demo shooting spec (continuous takes, no jump cuts)

- T1 plates-to-browser (45s) · T2 rainbow prop (60s) · T3 visitor chase + difference (50s) · T4 rigor scroll (25s) · T5 census + airplane offline (45s) · T6 repo + QR hold (15s). URL visible, finger in frame, airplane toggle on camera. Canned: all JSONs/cutouts/vectors cached. Fallback: USB backup + printed frames + QR cards.
