# STELLAR — one-page summary

## Approach

NASA's SPHEREx mission re-images the entire sky every ~6 months in 102
near-infrared bands. Anything that moves or flares between visits — comets,
asteroids, variable stars — reveals itself the moment two epochs are compared.
STELLAR is the public front door to that comparison: pick any patch of
sky, blink its visits, and see what changed. No login, no background needed.

The app has two faces. The static site (usable offline, on a phone) ships
pre-rendered epoch cutouts, a 2,590-cell measured coverage map, and 20 curated
blink fields. A dev API proxies IRSA for everything else: epoch discovery,
on-demand cutouts for *any* visited coordinate, WCS-aligned difference
detection with dipole significance, aperture light curves and spectra, and
Gaia/SkyBoT cross-matches. A canvas viewer (blink, side-by-side, swipe, true
difference, false color), an observer-mode sky with real HiPS imagery plus
catalog stars, and CSV/JSON/PNG/WebM export complete the loop from curiosity
to evidence.

## Data sources

- **SPHEREx Quick Release 2 via NASA/IPAC IRSA** (TAP `spherex.*`, SIA2, IBE
  cutouts; DOI `10.26131/IRSA652`) — every pixel, epoch count, and MJD.
- **CDS Strasbourg** — DSS2/2MASS sky imagery (HiPS), SIMBAD names.
- **ESA Gaia DR3** — star cross-matches and observer overlays.
- **IMCCE SkyBoT / MPC / JPL Horizons** — solar-system cross-checks and links.
- Honesty rule: same-band blinks only (LVF physics), missing data renders as
  missing, every number traceable to one of the above.

## Limitations

- IRSA is slow and flaky (minutes per query, frequent 503/422s) — mitigated
  with bounded queries, retries, sibling-frame fallback, and layered caches.
- IMCCE retired the legacy SkyBoT cone endpoint mid-project; auto-matching is
  degraded to manual checker links behind a circuit breaker.
- Two polar cells have no QR2 coverage; some frames refuse IBE cutouts
  despite TAP footprints; per-band and report coverage is still filling in.
- Frontend math (coordinates, stretch, colormaps) is unit-tested; canvas
  rendering itself is verified by build + manual passes only.

## Future work

True on-screen cardinal placement, linked side-by-side cursors (shipped),
deep-field stacks, ecliptic-belt densification, planet overlays, WISE side
panel, 3D Sun–Earth–object geometry, weekly CI refresh, community flag
aggregation, multi-language UI.
