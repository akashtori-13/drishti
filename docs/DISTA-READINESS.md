# DISTA readiness: what is verified, what we measured, what is missing

Companion to the team's SPHEREx strategy brief (Version B). This file contains
only statements checked against live sources on 2026-09-25 or measured in this
repo just now. Grades: FACT (live source, URL given), MEASURED (this repo),
HYPOTHESIS/OPEN (unproven). Nothing here is a decision.

## 1. Fact check against live sources (all URLs fetched 2026-09-25)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | 0.75–5.0 µm, 102 channels, six LVF arrays | FACT | IRSA QR overview; JPL quick-facts; spherex.caltech.edu/instrument |
| 2 | ≈6.2″ pixels | FACT | spherex.caltech.edu/page/instrument, Table 1 |
| 3 | R ≈ 35–128, band-dependent (B1 39, B2 41, B3 41, B4 35, B5 112, B6 128) | FACT (corrects the brief's 41–135) | caltech-ipac.github.io/spherex-archive-documentation; JPL Science (35–130) |
| 4 | All-sky ~6 mo cadence, poles denser | FACT | JPL quick-facts; spherex.caltech.edu/page/survey |
| 5 | QR2 = Quick Release 2, DOI 10.26131/IRSA652, TAP/SIA2/IBE live | FACT | IRSA QR overview; spherex data-access docs; QR1 retired Feb 2026, QR3 from Sep 2026 (DOI …662) |
| 6 | L2 MEF has IMAGE + FLAGS bitmap + VARIANCE + WCS-WAVE (+ZODI/PSF) | FACT | spherex-archive-documentation/spherex-data-products |
| 7 | Ice bands: H₂O **3.05**, CO₂ **4.27**, CO 4.67 µm | FACT (use these numbers, not 3.0/4.26) | spherex.caltech.edu origin-of-water (McClure et al.) |
| 8 | Launched 11 Mar 2025, surveying since 1 May 2025, first map done Dec 2025 | FACT | science.nasa.gov/mission/spherex; Caltech news |
| 9 | Official multi-epoch/variability fitting tool | NONE FOUND | data-tools page lists forced photometry (per-point mjd/lvf_id, no variability fit), mosaic, cutout, source-discovery, MOST — no time-domain modelling |
| 10 | Published flight asteroid-reflectance extraction | NONE FOUND | Only pre-launch simulation (Ivezić+2022: ~100k/10k asteroids) and real 3I/ATLAS comet spectra; MOST supports Horizons/MPC frame lookup; SOLO+SSOC catalog still in prep |

Implications: the brief's biggest uncertainties resolve favorably — the data
products it needs (variance, flags, per-point MJD/LVF) exist, the survey is
live, and no official variability engine or published flight asteroid spectra
were found. R range and ice wavelengths should be corrected to the values above.

## 2. Measured in this repo just now (bundle at `spectrahunt-web/public/`)

- 20 fields, **143 epochs, all effectively single-band**: 19 fields band 3
  only, 1 field (nep-deep) band 4 only; 138/143 epochs band 3, 5 band 4.
- Only **41/143 epochs carry `wavelength_um`**, spanning just **2.02–3.12 µm**
  (two distinct values ≈ band centers, not per-visit LVF positions).
- Reports **do** carry 6-band spectra with `flux`, `flux_err`, MJD per band —
  the closest thing to SED data in the bundle — but values are raw
  (0.0 fluxes, negatives present). Light curves carry MJDs.
- Epochs already record MJD + detector + band, so the per-visit
  (λ, t, σ) triplets a continuum engine needs are **one extraction step away**,
  not a re-architecture: pick one target (3I/ATLAS), pull per-array flux +
  variance, plot observed slope. That is Experiment 1, and the scaffolding
  (bandstacks, reports, MJDs) exists.

What this means for the brief's questions:
- **Experiment 1 result (2026-09-25)**: `scripts/extract_track.py` on 3I/ATLAS
  measured 6/7 cutouts across all six bands with per-visit λ from the WCS-WAVE
  grid (1.13/1.67/2.43/3.86/4.44/5.02µm;
  `data/track_3i-atlas.json` + `.png`). All fluxes sit at the noise floor
  (~1σ: 4.3±3.9, 1.2±3.5, 2.8±4.9, 1.5±1.4, 1.1±0.9, 0.8±1.0). Horizons
  (ATLAS C/2025 N1, geocentric) confirms why: the comet moves ~2.5°/5d and is
  degrees from the fixed aperture at every epoch — fixed-position photometry
  on a fast mover measures empty sky. This is not a pipeline failure; it is
  direct evidence that **Direction A (Horizons-tracked extraction) is required
  for solar-system bodies**, and the correct control is the same pipeline on a
  static star (Experiment 3). Open calibration note: measured λ lands ~1%
  above each band's nominal max — within one bandwidth, flagged not hidden.
- **Experiment 1b, tracked (2026-09-26)**: `--tracked 3I` resolves the comet
  per visit via Horizons and measures at the moving position: 11/14 cutouts
  across all six bands (`data/track_3i-atlas-tracked.json`; B5 needed a retry
  after transient IBE 503s). Faint but on-target: B4 0.7±0.1, B6 1.0±0.3,
  B1 1.0±0.3, B5 0.9±0.2. All failures are IRSA transport, none pipeline.
- **Experiment 3, control star (2026-09-26)**: same pipeline, fixed aperture
  on UCAC4 363-079561 (2MASS J16503662-1730286, SIMBAD-confirmed field star):
  11/12 cutouts, SNR 30–160 per point
  (`data/track_252.65242_-17.50776.json`, shipped in-app as
  `spectrahunt-web/public/tracks/track_control-star.json`). The pipeline
  measures clean stellar slopes. Caveat, not hidden: repeat visits disagree
  up to ~2× in B1/B2/B4 (same MJD, full aperture npix — not edge clipping).
  Undiagnosed: background systematics vs genuine variability (SIMBAD type
  Pe*). Visit repeatability is therefore the next systematics to chase
  before any residual-ranking engine (Step 7) can be trusted.
- **Pair-colour joint constraint (2026-09-26)**: `scripts/pairfit.py`
  reparameterizes each simultaneous D1+D4/D2+D5/D3+D6 pair (confirmed in our
  data: paired bands share MJDs to ~1e-3 d from the same weekly directory)
  into amplitude A=fa+fb and colour R=fa/fb with propagated errors, then
  tests cross-epoch (dA/dR in σ). Control star: D1+D4 across two visits
  2 min apart gives dA=0.22σ but dR=28.9σ — an amplitude-conserving colour
  flip no star performs in 2 minutes. The method works as built: it caught
  an inconsistency, and on a control target the only honest reading is
  instrumental systematics between consecutive exposures, i.e. the "or
  simply an artifact" branch. Comet: 3 pairs, one per family — the failed
  visits broke simultaneity, so no cross-epoch verdict yet; needs the
  counterpart exposures, not more model.
- **Experiment 2** (what the same-band rule discards): measured
  (`scripts/audit_discard.py`, `docs/discard-audit.json`): **466/466 pairs
  kept, 0 rejected** — every field is single-band, so the bundle cannot
  contain a rejectable pair by construction. The discard happens upstream at
  index time; quantifying it needs TAP-side multi-band visit lists. Script
  kept for re-runs once multi-band epochs land.
- **Direction A vs B**: the bundle cannot yet feed either (no multi-band
  visits per position). Direction A needs Horizons-tracked extraction code
  (new); Direction B needs per-array flux+variance for ≥1 target (Experiment 1,
  small). Both start from the same extraction step — do that first, then decide.
- **Honesty note for any demo**: report spectra contain 0.0/negative fluxes;
  any plotted SED must show error bars and masked points, per the repo's own rule.

## 3. Prior art (literature + tooling search, 2026-09-25)

- No paper found that fits continua or tracks spectral change across
  SPHEREx visits/detectors. Nearest works all pair single-epoch SPHEREx
  spectra with external light curves: Karambelkar et al. 2026 FUOr/novae
  (arXiv:2602.07129), Zhang et al. 2026 blazar (arXiv:2602.05222), Dai et al.
  2026 AGN (arXiv:2602.21502), Tzanidakis & Davenport 2026 planetesimal
  collision (arXiv:2603.10952).
- No flight asteroid-reflectance extraction found. Only 3I/ATLAS spectra
  exist (Lisse et al. 2025 RNAAS arXiv:2508.15469; ApJL arXiv:2512.07318;
  Dec-2025 RNAAS arXiv:2601.06759) plus pre-launch simulations
  (Lisse/Bauer/Kim 2024; Mahlke et al. 2022) and commissioning support
  (Lim et al. 2026 SOLO). SSOC catalog still future (Bock et al. 2025).
- Official tooling has no variability modelling: pipeline paper is
  per-exposure calibration only (Akeson et al. 2025, accepted ApJS);
  time-resolved source catalog arrives Aug 2027 / Jan 2028 (not in QR3).
- Cautious reading: a visit-to-visit spectral-change method looks
  unoccupied, but confirm via ADS/full-text before claiming novelty.

## 4. Recommended next actions (in order)

1. Run Experiment 1 as a script (not app UI): 3I/ATLAS per-array flux +
   variance + slope plot with uncertainties. Go/no-go for everything.
2. Audit TAP-side same-band discard on ~20 recent fields (Experiment 2).
3. Static-star continuum residuals on Gaia-known stars (Experiment 3).
4. Only then choose A vs B; keep the viewer as the evidence surface either way.
