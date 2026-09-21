# SpectraHunt

**NASA Space Apps Challenge 2026 · Advanced · Astrophysics / Planets & Moons / Software**

Since 2025, NASA's SPHEREx mission maps the entire sky every six months in 102 bands
of near-infrared light. Comets, asteroids and variable stars reveal themselves by shifting
between visits. SpectraHunt is a public blink comparator: same sky, different time.

Open `#/blink/3i-atlas` and drag — interstellar comet 3I/ATLAS, quiet in August 2025,
erupting in December 2025.

## Quick start

```bash
cd spectrahunt-web && npm install && npm run dev   # http://localhost:3000
```

Live cutouts (optional dev API):

```bash
pip install -r requirements.txt
python -m backend                                    # :8000
cd spectrahunt-web
NEXT_PUBLIC_DATA_MODE=live NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Fill showcase PNGs (weekly / manual, never on the CDN):

```bash
python scripts/build_showcases.py --only 3i-atlas
cd spectrahunt-web && npm run build
```

## Layout

* `spectrahunt-web/` — Next.js 16 static export (`out/`). Views: Home, Blink, Sky, About.
* `backend/` — dev-only FastAPI: epoch discovery, cutout proxy, resolve, SkyBoT.
* `scripts/build_showcases.py` — TAP → IBE → PNG indexer.
* `ARCHITECTURE.md` — the full plan.

## Data

SPHEREx Quick Release 2 via IRSA (DOI `10.26131/IRSA652`). Discovery via TAP
`spherex.artifact ⋈ spherex.plane`, pixels via IBE cutouts. Same-band blinks only
(LVF rule: |Δλ| < ½ bandwidth).

> This publication makes use of data products from SPHEREx (JPL/Caltech, NASA).
