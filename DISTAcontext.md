# DISTA context — spectral-temporal strategy fork

## What DISTA is
DISTA is the fork that asks whether SPHEREx's spectral-temporal data can do
more than single-epoch blinking: track spectra across visits, test colour
evolution, and rank variable candidates — without overclaiming.

## The brief's questions (verbatim intent)
- Direction A: Horizons-tracked moving-target extraction (solar-system bodies).
- Direction B: per-array flux+variance spectra for static targets.
- Core test: "did the source change — brightness, colour, or artifact of
  comparing different wavelengths at different times?"

## Verified facts (fetched 2026-09-25/26, not assumed)
- SPHEREx LVF: R 35–128 across 0.75–5.0µm; ice features at 3.05/4.27µm.
- Simultaneous detector pairs: D1+D4, D2+D5, D3+D6 (confirmed in our data:
  paired bands share MJDs to ~1e-3 d from the same weekly directory).
- QR2 DOI 10.26131/IRSA652; QR3 (Sep 2026) DOI 10.26131/IRSA662, pipeline v27,
  collections `spherex_qr3*` live-verified; QR3 = surveys 3+4 (new epochs).
- No official variability tool or flight asteroid spectra found in literature.

## Experiments and verdicts
1. **Fixed-aperture 3I/ATLAS** → empty sky (comet moves ~2.5°/5d). Proved Direction A required.
2. **Discard audit** → 466/466 pairs kept (bundle is single-band by construction).
3. **Horizons-tracked comet** → 20/20 measured, faint but on-target.
4. **Control star (UCAC4 363-079561)** → SNR 30–160; visit repeats exposed the
   masked-core flip → fixed in `aperture_flux` (exclude + area-correct + flags).
5. **Pairfit (A,R) + joint shared-R χ²** → comet 7/7 consistent-static;
   28.9σ control phantom confirmed dead post-fix.
6. **Ranking** → comet rated; 4 stars UNRATED (masked cores) — gate holds.

## Method rules (non-negotiable)
- Same-release, same-band pairing only; cross-release/cross-band gets numbers, never verdicts.
- Core-masked points excluded from evolution verdicts, shown hollow.
- Pre-fix data carries `pre_fix_caveat`; mixed tracks labeled per release.
- No "QR3 improves X" copy until measured before/after.

## Open
- QR3 reprocessing runbook (control → comet → field stars), ~380MB budget.
- Step-7 depth: only faint sources rate clean verdicts.
- Per-visit λ is band-representative (cutout headers lack parent offset).
- Full record: `docs/DISTA-READINESS.md`. Pipeline: `scripts/extract_track.py`,
  `scripts/pairfit.py`, `scripts/ranking.py`. UI: blink 3I-ATLAS rail.
