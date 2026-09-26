# DRISHTI: 240 Seconds
**NASA Space Apps Challenge — Pitch Script · Four-Act · 2026-09-27**
**Official timing: WHO 45s / WHY 60s / WHAT 60s / SO WHAT 75s. Spoken ~210s + 15s cards = under 240s.**

> Draft 6 — round-4 judges' fixes: dated retention, six LVF arrays, replay-simulation badge, ORNI labels, Zubayer offline beat, first-person decisions, handoff cues, trimmed Act III, sourced counts, locked-tripod demo takes.

---

## Act I · WHO — The Plates (0:00–0:45)
**Objective:** Stakes in 10s, spoken roster with handoffs, challenge slot, dataset line.

> **VISUAL:** Black. Two hands hold printed SPHEREx frames, flip them click-click. Locked tripod: slide frames down, tap phone in same frame — no whip-pan. Lower-thirds: full names, one at a time. Card: [CHALLENGE].

**[FAST]**

**HIMEL:** Thousands of stars stayed put. One moved — and it became Pluto.

In 1930 Tombaugh blinked two plates by hand, night after night.

We're Team AKASHTORI — *[gestures; each steps in, says own name]* I'm Himel Das, systems. **[ZUBAYER]** Zubayer Hasan Shaad, tech. **[HEDAYET]** Md Hedayet Ullah, research. **[MAHDIN]** Md Mahdin Al Abrar, story. **[ALIF]** Aazmaine Alif Abrar, quality. **[ORNI]** Suraiya Ratry Orni, science — for [CHALLENGE].

**[SLOW]**

**HIMEL:** SPHEREx photographs the whole sky every six months in 102 infrared colors. No team can practically blink all that by hand. So we built DRISHTI: cached SPHEREx Quick Release 2 cutouts (QR3 where covered) from the NASA/IPAC Infrared Science Archive, in a browser, on a phone.

> **ANCHOR:** Thousands of stars stayed put. One didn't.

---

## Act II · WHY — The Drift (0:45–1:45)
**Objective:** Villain is geometry. One idea: drift breaks comparison.

> **VISUAL:** Hand slides rainbow strip over pixel grid. Timeline dots dim to idle — none leave the archive. Lower-third: `ILLUSTRATION — not measurement`.

**[SLOW]**

**MAHDIN, holding prop:** SPHEREx carries no moving prism. Six rainbow filters, one per detector — each pixel sees one tint. Same star, left side looks bluer, right side looks redder.

*[hands strip to Hedayet]*

**HEDAYET:** I'm Hedayet, research. I set our same-colour rule: when the tint shifts, visits can't be fairly compared, so good data sits idle for that question. Nothing we use was deleted — IRSA still serves QR2 and QR3 as of September 2026.

**[FAST]**

**HEDAYET:** That idle is the waste. Nobody messed up. That's just how they built it.

> **ANCHOR:** The drift is nobody's fault. It's geometry.

---

## Act III · WHAT — The Tool (1:45–2:45)
**Objective:** Continuous take: comet, 3 allies, control-star kill, qualified static. URL visible, finger in frame.

> **VISUAL:** Continuous single take, UI-in-hand. Tap the 3I/ATLAS chip → difference mode: field cancels to gray, one remnant pops with A→B vector. Hold 3 seconds silent. URL visible throughout. Badge: `cached replay — simulation where labeled, not live sky`.

**[FAST]**

**ZUBAYER, phone in hand:** This is 3I/ATLAS — third one we've ever seen from another star. If you stare at one spot you lose it. So I pulled its saved Horizons path and checked where it actually landed.

*[tilts phone to Orni]*

**ORNI:** I'm Orni, science — I sign off only when archives agree. SPHEREx for the image, Gaia for the background stars, Horizons for where it should be.

*[SILENT STAMPS — SIMBAD, SkyBoT (labeled degraded), CelesTrak, DSS, Yale — lower-thirds only]*

**[SLOW]**

**HEDAYET:** We messed one up. I'll just say it: our pre-fix pipeline flagged a CONTROL star — 28.9 sigma. Contamination, not sky.

*[steps back; Alif steps in]*

**ALIF:** I'm Alif, quality — I pulled the pixel flags and withdrew the verdict. We left it as "can't tell" instead of making something up. For 3I we measured all six bands, Horizons-tracked — faint, consistent-static, no brightness or colour evolution at these uncertainties. Numbers and error bars are on screen. We're not claiming an outburst.

> **ANCHOR:** A difference is only a discovery once the detector is ruled out.

---

## Act IV · SO WHAT & NEXT — The Sky (2:45–4:00)
**Objective:** Beneficiary + metric, spoken repo + QR, concrete ask, fixed closer, 3 static cards inside 240s.

> **VISUAL:** Census map (lower-third: `counts: repo inventory`), dice roll into a cached field, σ-ranked cards. Phone held up: airplane mode ON (toggle visible), timeline blinks from cache. Repo URL + QR held 5 seconds.

**[FAST]**

**ORNI:** Twenty fields, 143 epochs, all in public JSON. If your classroom has no wifi: 143 epochs blink offline, no login, no FITS download.

*[holds phone up; Zubayer steps in]*

**ZUBAYER:** I'm Zubayer — I cached it so planes stay offline. The code is MIT at github dot com slash akashtori-13 slash drishti — on screen now, QR held. Schema's in the readme.

**[SLOW]**

**MAHDIN:** One part we didn't finish — census-wide pair agreement is still open. If it's negative we'll post that too. Tonight: open the repo issues page linked from the QR, blink one cached field, file field plus two epochs plus a screenshot. Pass or fail counts.

*[long pause. All six step into frame.]*

> **FINAL SPOKEN WORDS — HIMEL, hold, then black:**
> Tombaugh blinked two plates. We blink 143 epochs — and keep every visit we can trust.

**END CARDS (static, no narration, inside 240s):**
- Card 1 (4s): DRISHTI / Team AKASHTORI — all six names + roles / Space Apps 2026 / [CHALLENGE] / 143 epochs · 240 cutouts · public JSON + repo URL + QR / MIT · offline-capable · no login.
- Card 2 (6s): Data — SPHEREx/IRSA QR2 https://doi.org/10.26131/IRSA652 / QR3 https://doi.org/10.26131/IRSA662 / ESA Gaia DR3 · CDS SIMBAD/Sesame + 2MASS/DSS · NASA/JPL Horizons (geocentric) · IMCCE SkyBoT / MPC checker links only / CelesTrak via mirror (checksummed) / Yale BSC v5 / d3-celestial / Messier-NGC (artistic render).
- Card 3 (5s): Negative results reported too · SkyBoT degraded, labeled · nebula art marked · replay labeled simulation · no AI sky imagery · no stock footage · English subtitles burned-in + .srt.

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

- T1 plates-to-browser (40s, locked tripod) · T2 rainbow prop (55s) · T3 visitor chase + difference (45s) · T4 rigor scroll (20s) · T5 census + airplane offline (40s) · T6 repo + QR hold (10s). Spoken ≈210s + 15s cards = under 240s. URL visible, finger in frame, airplane toggle on camera, "cached replay" badges on canned takes. Canned: all JSONs/cutouts/vectors cached. Fallback: USB backup + printed frames + QR cards.
