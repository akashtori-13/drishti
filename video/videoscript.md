# DRISHTI: 240 Seconds of Glory
**NASA Space Apps Challenge — Pitch Script v3.9 · Four-Act · Data-Glazed Cut**

> [!CAUTION]
> **Producer honesty flags — resolve before shoot, not spoken.**
> This draft contradicts measured repo data in 7 places. Each must be fixed
> or cut before filming, or the Best-Use-of-Data case collapses on fact-check:
> 1. **"Definitive 143-sigma signal" (3I/ATLAS)** — measured result is faint,
>    consistent-static (pairfit 7/7, dA/dR ~0.5σ, joints p 0.34–0.49, one D1+D4
>    link dR=2.11σ disclosed). No outburst claimed. See `data/pairfit_3i-atlas-tracked.json`, `docs/DISTA-READINESS.md`.
> 2. **"Cross-checked live, in real time … Eight archives, one page"** — app is
>    offline-first on precomputed JSONs; SkyBoT endpoint 404s (labeled
>    unavailable); nothing is live. See `USEOFDATA.md`.
> 3. **"Captured across five frames … pipeline keeps two, DRISHTI keeps all five"**
>    — tracked file is 20/20 (`data/track_3i-atlas-tracked.json`); "five" and
>    "keeps two" are unverified.
> 4. **"Over a billion objects" / "five centuries of naked-eye stars"** — unsourced.
>    Yale BSC v5 = 1,627 stars (V≤5.0). Drop or source.
> 5. **"Real generated footage of the universe"** — contradicts the project's
>    no-AI-sky-imagery rule. Use archival/DSS or labeled illustration only.
> 6. **"Hans Zimmer type background music"** — Zimmer's music is copyrighted;
>    a soundalike still risks Content ID. Commission original or licensed music.
> 7. **QR3 "traces 3I/ATLAS across every array"** — measured pixels are QR2;
>    QR3 = linked cutouts where covered. See `data/qr3_coverage.json`.
> 8. Blanks to fill: Flagstaff city slot, months counts, `[CHALLENGE]` title,
>    Himel & Zubayer faces excluded per note (guardian consent covers names only).

Same tone and pacing throughout. The data is named out loud, extensively — a rapid “who's talking to who” montage in Act III naming every live archive DRISHTI cross-checks against, plus a broader-sky moment in Act IV. A full on-screen credits manifest sits at the end of this document, meant to run under the final black frame.
Target runtime: 4:00 (240 seconds)
ACT I · WHO — THE INHERITANCE 0:00 – 0:45
Open with a paradox, told in short, cinematic beats. Land the historical scene before the audience knows it's a history lesson. Introduce the team as the continuation of an instinct. Name NASA's archive once, early, so the data provenance is established before anything else.
VISUAL
Black. Three seconds of nothing. Then the SPHEREx all-sky map fades in, rotating slowly. No music, voice only. A faint, small credit line low in frame throughout the film — NASA/JPL-Caltech · IRSA — never called out, always present. At 0:22, hard cut to a 1930 photograph: Clyde Tombaugh at his blink comparator in Flagstaff. Grain. Cold light. A slow push in on his hands.
SLOW
In 1930, in , Arizona, a twenty-four-year-old astronomer was alone with just two photographic plates and proly with a cup of coffee — blinking them back and forth. And he repeated this, Night after night for months. 			
Yeah, he was Clyde Tombaugh. What he found after  months of staring into the dark was Pluto.  
[visual style: veritasium like historical animation]

Ninety-six years later, NASA's SPHEREx maps the entire infrared sky every six months — over a billion objects, in a hundred and two spectrum the human eye has never seen. and every image lands in a public NASA archive called IRSA. 
[visual style: if available, real satellite launching footage and archive overview. Otherwise, use motion graphics]

And the way the instrument is built means most of what it sees can never be compared to itself. So, a significant portion of it gets thrown away.
AND( emp)  This is what led us to our project!  
[visual style: 1. Product animation imitating Kurzgesagt style, 2. Motion graphics with emphasis effect]

[pause — let the loss land]
Six of us sat in our room, staring at the same problem. In a lil screen, this time.
I'm Mahdin. With my mates (consequentially comes Aazmaine, Saikat and Orni followed by Himel and Zubayer’s text intro)……………… We're Team AKASHTORI. This is DRISHTI. 
[visual style: 1. Artemis mission crew intro, 2. Motion design with sophistication]
Don’t have Himel & Zubayer’s face here.
ACT II · WHY — THE RULE THAT FORGOT HOW TO SEE0:45 – 1:45
Name the antagonist. Explain the LVF as a physical system, not a feature list. Land the 466/0 number clean and alone — it's the proof, so let it breathe. End on the reframe that opens Act III.
VISUAL
Cut to the LVF diagram — a flat prism laid across the detector, the wavelength shifting continuously as a colour gradient. A star lands at two different points on the array across two epochs; a wavelength readout counts up from 2.02 μm to 2.47 μm. Then the same-band rule appears as a single equation: |Δλ| > bandwidth/2 → DISCARD. The equation cracks. The number appears, clean and alone, nothing else on screen: 466 kept. 0 rejected.
FAST

SPHEREx doesn't use filters — every detector is coated with a Linear Variable Filter, and the wavelength shifts continuously across its surface, so a star lands on a different spectrum depending on exactly where it falls.
Revisit that same patch of sky six months later, and the band has moved.
But here ( emp ) comes the problem that hurts us and the reason for drishti. 
[visual style: 1. If possible, using 3D animation or even visually attractive 2D animation is perfect.]
If the wave-length does not match, it throws the visit away. Collapses months of observation into two js points — oldest and newest — and literally ( emp) drop everything in between.
[pause] 
SLOW
We measured what that actually costs, on our own data: four hundred and sixty-six visits were kept.

Yet this time, not a single one was rejected. Although the system worked with perfection—but still the answer was not found. 
Because a mismatched visit isn't noise. It's the second point on the object's own (emp) spectrum, which was sampled at a wavelength, nobody even noticed at all. 
[visual style: Kurzgesagt style animation with an animal/bird character]
BUT WE DID! OUR DRISHTI IS HERE FOR THIS JOB. [visual style: Climax style, proper sound effect, product announcing type of motion graphics]


ACT III · WHAT — DRISHTI AND DISTA1:45 – 3:00
Show the tool. Right after introducing it, one fast, rhythmic montage beat names every live archive DRISHTI talks to — delivered like a roll call of allies, not a spec sheet. Then two short true stories carry the rigor. DISTA closes the act as a prototype, calibration named once, framed as rigor.
VISUAL
Cut to the live DRISHTI URL. Cursor types 3I/ATLAS. Enter. The blink begins — August, December, August, December. As the montage line plays, quick-cut a label stamping onto the frame for each archive named — Gaia, SIMBAD, Horizons, SkyBoT, MPC, 2MASS/DSS, Yale BSC — like stamps hitting a passport, one per beat, fast. Then switch to Diff. Motion vectors appear. Open the spectrum panel. Then a wide shot of the candidate list: 20 fields, 143 epochs. Then a simple SED plot with five mismatched points and a fitted curve, labelled DISTA · prototype.
FAST
This open-access and interactive app allows users to blink every SPHEREx visit for a specific region. Without even the internet and having the burden of processing IRSA data. anyone can access it offline and dive into the set of Spectra.  
[visual style: product launch motion graphic animation style with SFX]
 MONTAGE — QUICK, RHYTHMIC, ONE ARCHIVE PER BEAT
And SPHEREx isn't working alone. Every position you search gets cross-checked live, in real time, against Gaia for the star that's really there, SIMBAD to resolve its name, JPL Horizons for anything moving through the frame, SkyBoT to flag anything that shouldn't be, the Minor Planet Center to check our own homework, 2MASS and the Digitized Sky Survey for the field around it, and the Yale Bright Star Catalogue — five centuries of naked-eye stars — for context. NASA. ESA. JPL. Caltech. Yale. Eight archives, one page, all open, all credited, none of it invented.
And the SPHEREx image itself traces to one named release — QR2 which is  cited by its DOI, in the footer, in every export, every time. ( Emp) 
SLOW
Lets watch the result: the interstellar comet 3I/ATLAS, captured across five frames. A definitive 143-sigma signal, drifting through the dark at a mere 0.3 arcseconds a day.
Comets don't sit still in the sky.  This is why a fixed aperture found nothing at first but just an empty sky. So, We tracked it along its real Horizons ephemeris instead, and caught it on target, in every visit ( emp): 
This is where our drishti wins. The standard pipeline keeps two of these five. But our DRISHTI keeps all ( emp)  five. 
[visual style: Kurzgesagt type animation]
[pause]
A quiet one nearly got past us too. A control star which is directly straight out of Gaia spiked on one visit like something had changed. But  it did not. (With non Chalant vibe) A masked (emp)  pixel was hiding inside our own aperture. And We (emp)  caught this, then fixed it, and got our vision. And vision means Dristhi in Bengali. That's how DRISHTI came. 
[visual style: Veritasium style 2D animation]


Every number on this screen has already survived us trying to break it.
But keeping every visit is only half of the job. 

Here comes DISTA, our second layer which is still a prototype. every visit is a point on the object's own spectrum, even ( emp ) the mismatched ones. So it fits a curve through all of them. Then asks,  what does not belong?
DISTA pairs the detectors that see the same sky in the same instant, so we can tell whether a change lives in the object, or just in the instrument. And we say plainly what we haven't proven yet: those pairs have to agree with each other first. And that ( emp) is the next experiment. 
[visual style: SaaS product launch type motion graphics with SFX]
ACT IV · SO WHAT & NEXT — THE POTENTIAL3:00 – 4:00
Show what DRISHTI unlocks in one clean breath of numbers, then pull back to the rest of the sky DRISHTI renders — one more short, rhythmic naming beat. Name DISTA's frontier in one sentence. State the next experiment, naming the next SPHEREx release by name. Return to Tombaugh and land on a short, declarative line about the archive — not a question.
VISUAL
Cut to the live DRISHTI URL. Scroll slowly through the 20 fields, 143 epochs, 240 cutouts. Then the home sky view — bright stars, nebula glows, constellation lines, a satellite track — each layer briefly highlighted as it's named. Then a single slide: Next — QR3, trace 3I/ATLAS across every array. Final shot: the all-sky map, slow fade to the 1930 photograph. Hold. Black — and under the black, the credits manifest can run as a real end-crawl.
SLOW
now the qn might arise: what does this even ( emp) change to be precise? 
Let's break it down 
A student in Bandarban, Bangladesh. A teacher in Nairobi, Kenya. An amateur astronomer in Chandpur. Someone with just a phone in his hand. 

 Anyone , anywhere in the planet, can now watch the infrared sky-change over time without 
 Any pipeline, 
Any permission, 
Any waiting.
And the crazy part? 
>1000 fields. 
>A hundred ( emp)  and forty-three epochs.
> Two hundred and forty cutouts. 
These all Run on a phone, even on a plane, even when the data sources themselves ( emp)  are down. 
[visual style: 1. Veritasium type 2D animation with images, 2. SaaS motion graphics]
MONTAGE — SHORT, LIGHT
And zoom out, and the rest of the sky is real too — a five-hundred-year-old catalogue of naked-eye stars, sixteen Messier nebulae anchored to their true coordinates, constellation lines drawn from charts astronomers have used for a century, live satellites tracked through CelesTrak. All credited. Nothing invented.
[pause]
And DISTA is where it gets exciting. SPHEREx was built to catch ice — water, carbon dioxide — hiding in that spectrum, but it is very difficult to track how any of it changes over time. We're building an effortless solution for everyone.
FAST
Our next experiment is already running, on QR3 — SPHEREx's newest release which traces 3I/ATLAS across every array, and see if the systematics are small enough to trust. If they are, DISTA works successfully! 
[visual style: Vox style animation with some of Kurgesagt effect]
( Eita bolar por we can do a voice over je “ ahhh, peace” ( realizing our dista works! ) but eta vdo te oivbe present korte partesi hbe. Eta spectator ke informal vibe diye attract korbe) 

Even If ( emp)  they're not, let's just say so — that's a crazy/ interesting finding too for the field of astronomy!  
[long pause — let the room go quiet]
FINAL SPOKEN WORDS — HOLD, THEN BLACK
Somewhere in this data, there may be something we don't even have a name for yet.”
[2 sec silence]
“The question is… will we recognize it when we see it?
[visual style: real generated footage of the universe (Nebula, galaxies, stars, blackholes, quasers, super nova), sliding one by one so fast, NatGeo type documentary effect, recreating Oppenheimer ending scene with Hans Zimmer type of background music]


FULL DATA & SOURCES MANIFEST
Not spoken. Meant to run as an end-credits crawl under the final black frame (Act IV), or to sit in the video description / repo README. Every source DRISHTI touches, named — nothing owed goes unnamed, even what never makes it into the voiceover.
Source
What we use
Credit / DOI
NASA/JPL-Caltech SPHEREx via IRSA
QR2 spectral images (L2), QR3 where covered — blink frames, spectra, tracks, verdicts
DOI 10.26131/IRSA652 (QR2), 10.26131/IRSA662 (QR3) — machine-enforced in-app
ESA Gaia DR3
Star positions + magnitudes
Credited, mission page
CDS SIMBAD / Sesame
Object identity + coordinate resolution
Credited
NASA/JPL Horizons
Small-body ephemerides — 3I/ATLAS tracking
Credited
IMCCE SkyBoT
Moving-object cone search
Credited
Minor Planet Center
Cross-check links
Mentioned
CelesTrak
Satellite TLEs
Credited
CDS 2MASS / DSS HiPS
All-sky context imagery
Credited
Yale Bright Star Catalogue v5
1,627 naked-eye stars
Credited
Messier / NGC positions
16 nebula anchor coordinates
Real positions, artistic render — labeled
Constellation lines (d3-celestial / Ofrohn)
Sky figures
Credited
