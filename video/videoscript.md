# DRISHTI: 240 Seconds of Glory
**NASA Space Apps Challenge — Pitch Script · Four-Act · 2026-09-27**
**Official timing: WHO 45s / WHY 60s / WHAT 60s / SO WHAT 75s. Total with cards: under 240s.**

> Draft 4 — multi-voice, absolutes swept, tired-student register. [CHALLENGE] slot for Sep-17 summaries.

---

## Act I · WHO — The Plates (0:00–0:45)
**Objective:** Stakes in 10s, spoken roster with handoffs, challenge slot, dataset line.

> **VISUAL:** Black. Two hands hold printed SPHEREx frames, flip them click-click. One continuous take whips to phone running DRISHTI on the same field — no cut. Lower-thirds: full names, one at a time. Card: [CHALLENGE].

**[FAST]**

**HIMEL:** Thousands of stars stayed put. One moved — and it became Pluto.

In 1930 Tombaugh blinked two plates by hand, night after night.

We're Team AKASHTORI — *[gestures down the line; each steps in]* I'm Himel Das, systems. **[ZUBAYER]** Zubayer Hasan Shaad, tech. **[HEDAYET]** Md Hedayet Ullah, research. **[MAHDIN]** Md Mahdin Al Abrar, story. **[ALIF]** Aazmaine Alif Abrar, quality. **[ORNI]** Suraiya Ratry Orni, science — for [CHALLENGE].

**[SLOW]**

**HIMEL:** SPHEREx photographs the whole sky every six months in 102 infrared colors. No team can blink all that by hand at scale. So we built DRISHTI: it blinks cached SPHEREx Quick Release 2 cutouts from the NASA/IPAC Infrared Science Archive, in a browser, on a phone. Here's the catch.

> **ANCHOR:** Thousands of stars stayed put. One didn't.

---

## Act II · WHY — The Drift (0:45–1:45)
**Objective:** Villain is geometry. Honest idle framing, one idea only.

> **VISUAL:** Hand slides rainbow strip over pixel grid. Timeline dots dim to idle — none leave the archive.

**[SLOW]**

**MAHDIN, holding prop:** SPHEREx carries no moving prism. A rainbow filter is glued to the detector, so each pixel sees in one of 102 infrared colors. Same star, left side looks bluer, right side looks redder.

*[hands strip to Hedayet]*

**HEDAYET:** I'm Hedayet, research. I set our same-colour rule: visit after visit can't be fairly compared when the tint shifts, so good data sits idle for that question. Nothing got deleted. IRSA keeps everything. And when the detector flags a pixel, I set it aside.

**[FAST]**

**HEDAYET:** That idle is the waste. Nobody messed up. That's just how they built it.

> **ANCHOR:** The drift is nobody's fault. It's geometry.

---

## Act III · WHAT — The Tool (1:45–2:45)
**Objective:** Continuous take: comet, 3 allies, control-star kill with first-person owners, qualified static.

> **VISUAL:** Continuous single take, UI-in-hand. Tap the 3I/ATLAS chip → difference mode: field cancels to gray, one remnant pops with A→B vector. Hold 3 seconds silent. URL visible throughout.

**[FAST]**

**ZUBAYER, phone in hand:** This is 3I/ATLAS — third one we've ever seen from another star. If you stare at one spot you lose it, it moves two-and-a-half degrees in five days. So we pull its path from Horizons and just check where it actually landed.

*[tilts phone to Suraiya]*

**SURAIYA:** We didn't trust ourselves, so we cross-checked. SPHEREx for the image, Gaia for the background stars, Horizons for where it should be.

*[SILENT STAMPS — SIMBAD, SkyBoT (labeled degraded), CelesTrak, DSS, Yale — lower-thirds only]*

**[SLOW]**

**HEDAYET:** We messed one up. I'll just say it: my pipeline flagged a CONTROL star — 28.9 sigma colour change. Contamination, not sky.

*[steps back; Alif steps in]*

**ALIF:** I'm Alif, quality — I pulled the pixel flags and withdrew the verdict.

*[beat]*

**ALIF:** We left it as "can't tell" instead of making something up. For 3I we got six colours. Nothing moved, nothing flared. That's it. Numbers are on screen. We're not claiming an outburst.

> **ANCHOR:** A difference is only a discovery once the detector is ruled out.

---

## Act IV · SO WHAT & NEXT — The Sky (2:45–4:00)
**Objective:** Who-benefits, spoken repo + QR, open ask, fixed closer, 3 static cards inside 240s.

> **VISUAL:** 2,590-cell census map, dice roll into unknown field, σ-ranked cards. Phone held up: airplane mode ON (toggle visible), timeline blinks from cache. Repo URL + QR held 5 seconds.

**[FAST]**

**SURAIYA:** Twenty fields, 143 epochs, all in public JSON. Venue wifi will die — so it works offline, airplane mode. Repo's on screen, MIT, if you want it.

*[holds phone up; Himel steps in with QR card]*

**HIMEL:** Schema's in the readme — reuse the JSON in any app.

**[SLOW]**

**MAHDIN:** One part we didn't finish — do colours agree across pairs? It's labeled open. If it's negative we'll post that too. Blink a cached field offline tonight, send us where we disagree.

*[long pause — let the room go quiet. All six step into frame.]*

> **FINAL SPOKEN WORDS — HIMEL, hold, then black:**
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
