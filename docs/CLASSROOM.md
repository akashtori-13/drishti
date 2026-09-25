# Classroom blink hunt (45 minutes, no install)

**Goal:** every student finds something that moved or changed in the infrared sky,
using only a browser (or the offline DRISHTI app where bandwidth is scarce).

## You need

- One device per pair, any phone or laptop from the last decade
- This page open, or the DRISHTI app installed (works fully offline after first visit)
- Nothing to install, no account, no command line

## The hunt (pairs, 30 min)

1. **First blink (5 min).** Open the app, tap the **3I/ATLAS** chip. Drag the timeline
   between Aug and Dec 2025. Write down one thing that looks different.
2. **Difference mode (10 min).** Switch to **Diff**. Stationary stars cancel to gray.
   Whatever stays bright moved or flared. Flip **Motion color**: red is now, green is then.
3. **Dice hunt (10 min).** Hit **Surprise me** three times. For each field, record:
   field name, epoch dates, and one mover-or-variable verdict with its σ number.
4. **Verify (5 min).** Open the Catalogs tab. Is there a SkyBoT or SIMBAD match?
   Known object or genuine unknown? Defend your call to the pair next to you.

## Discuss (10 min)

- Why do we blink the *same band* only? (Hint: SPHEREx's filters paint each pixel
  a different wavelength per visit — check About → Method.)
- What could fool the detector? (Cosmic rays, bad pixels, bright-star halos.)
  How would you rule each out?

## Go further (5 min)

- Export your candidate as CSV. Its URL encodes the exact view — send it to a friend
  and they land on your discovery.
- All measurements are public JSON in the repo (`public/reports/`): plot a light
  curve in a spreadsheet and bring it next class.

Built by Team AKASHTORI for NASA Space Apps Challenge 2026. Data: SPHEREx QR2 via
IRSA (IPAC), DOI 10.26131/IRSA652.
