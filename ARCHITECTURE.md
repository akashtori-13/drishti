# SpectraHunt Architecture

## Overview

SpectraHunt is a web application for detecting moving objects (asteroids, comets) in SPHEREx astronomical data using difference imaging and machine learning.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                    Next.js 14 + TypeScript                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │   Home   │  │   Map    │  │ Field    │  │   Candidates   │  │
│  │   View   │  │   View   │  │  Viewer  │  │      List      │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STATE MANAGEMENT                           │
│                        Zustand Store                            │
│  • Coverage data  • Candidates  • Search results  • UI state   │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│    STATIC DATA MODE     │     │       LIVE API MODE             │
│   (Netlify Deployment)  │     │    (Local Development)          │
│  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │
│  │   data/*.json     │  │     │  │   FastAPI Backend         │  │
│  │   spectrahunt.db  │  │     │  │   /api/status             │  │
│  │   img/*.png       │  │     │  │   /api/coverage           │  │
│  └───────────────────┘  │     │  │   /api/field              │  │
│                         │     │  │   /api/blink              │  │
│                         │     │  │   /api/candidates         │  │
│                         │     │  │   /api/resolve            │  │
│                         │     │  └───────────────────────────┘  │
│                         │     │            │                    │
│                         │     │            ▼                    │
│                         │     │  ┌───────────────────────────┐  │
│                         │     │  │   SQLite Database         │  │
│                         │     │  │   • frames table          │  │
│                         │     │  │   • candidates table      │  │
│                         │     │  │   • skybot_cache table    │  │
│                         │     │  └───────────────────────────┘  │
│                         │     └─────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PIPELINE (Python)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   ingest.py  │  │  detect.py   │  │   build_static_      │  │
│  │              │  │              │  │   bundle.py          │  │
│  │ • SIA2 query │  │ • Cutouts    │  │                      │  │
│  │ • Headers    │  │ • Difference │  │ • Runs ingest        │  │
│  │ • Footprints │  │ • SEP extract│  │ • Runs detection     │  │
│  │ • Indexing   │  │ • Dipole pair│  │ • Exports JSON       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ IRSA SIA2    │  │ SkyBoT       │  │ AWS S3               │  │
│  │ (SPHEREx)    │  │ (IMCCE)      │  │ (nasa-irsa-spherex)  │  │
│  │              │  │              │  │                      │  │
│  │ • Frame meta │  │ • Asteroid   │  │ • FITS files         │  │
│  │ • Access URL │  │   IDs        │  │ • Cutout service     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ JPL Horizons │  │ CDS Sesame   │                            │
│  │              │  │              │                            │
│  │ • Ephemeris  │  │ • Star names │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Maps**: React-Leaflet
- **Charts**: Recharts
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Backend (Local Development)
- **Framework**: FastAPI
- **Database**: SQLite
- **Async**: asyncio
- **Validation**: Pydantic v2

### Data Pipeline
- **Astronomy**: astropy, astroquery, pyvo
- **Image Processing**: reproject, sep, photutils
- **FITS Handling**: astropy.io.fits
- **Cloud Storage**: boto3, s3fs, fsspec
- **Scheduling**: APScheduler

### Deployment
- **Static Mode**: Netlify (CDN, auto HTTPS)
- **Live Mode**: Docker + uvicorn (local dev)

## Directory Structure

```
spectrahunt/
├── README.md                 # Project documentation
├── ARCHITECTURE.md           # This file
├── netlify.toml              # Netlify deployment config
├── requirements.txt          # Python dependencies
├── .gitignore                # Git ignore rules
│
├── spectrahunt-web/          # Next.js frontend
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   │   ├── page.tsx      # Home page
│   │   │   ├── map/          # Sky map view
│   │   │   ├── field/        # Field viewer
│   │   │   └── candidates/   # Candidates list
│   │   ├── components/       # Reusable UI components
│   │   ├── store/            # Zustand state stores
│   │   ├── lib/              # Utilities & helpers
│   │   └── types/            # TypeScript type definitions
│   ├── public/               # Static assets
│   ├── package.json          # Node dependencies
│   ├── tsconfig.json         # TypeScript config
│   ├── tailwind.config.ts    # Tailwind config
│   └── next.config.mjs       # Next.js config
│
├── backend/                  # Python backend (local dev only)
│   ├── __init__.py
│   ├── app.py                # FastAPI application
│   ├── config.py             # Configuration constants
│   ├── db.py                 # Database schema & helpers
│   ├── ingest.py             # Frame ingestion pipeline
│   ├── cutouts.py            # FITS cutout handling
│   ├── detect.py             # Detection pipeline
│   ├── crossmatch.py         # SkyBoT/Horizons integration
│   └── tests/                # Unit & integration tests
│
├── scripts/                  # Build & utility scripts
│   ├── build_static_bundle.py    # Generate static JSON files
│   └── probe_endpoints.py        # Verify external APIs
│
└── data/                   # Generated static data (for Netlify)
    ├── status.json         # Pipeline status & stats
    ├── coverage.json       # 72×36 sky grid coverage
    ├── candidates.json     # Detected moving objects
    ├── demo_fields.json    # Pre-computed field data
    ├── spectrahunt.db      # SQLite database
    └── img/                # Rendered PNG cutouts
```

## Data Flow

### 1. Ingestion Pipeline
```
IRSA SIA2 API → Query QR2 frames → Parse headers (WCS, MJD, detector)
                                              ↓
                              Store in SQLite: frames table
                                              ↓
                              Spatial index: 72×36 grid cells
```

### 2. Detection Pipeline
```
Per sky cell + band group:
  1. Fetch cutouts via IRSA Cutout Service
  2. Read IMAGE, FLAGS, VARIANCE, WCS-WAVE HDUs
  3. Match wavelengths across epochs (critical for LVF)
  4. Mask bad pixels (FLAGS bitmask)
  5. Reproject to common WCS grid
  6. Subtract zodiacal background (ZODI extension)
  7. Difference consecutive wavelength-matched pairs
  8. Extract sources with SEP (both +diff and -diff)
  9. Pair positive/negative blobs (dipole detection)
  10. Cross-match with SkyBoT for known objects
  11. Score candidates (σ, dipole quality, multi-band)
  12. Store in SQLite: candidates table
```

### 3. Frontend Rendering
```
Static Mode (Netlify):
  Next.js → Fetch data/*.json → Zustand store → Render components

Live Mode (Local):
  Next.js → Fetch /api/* endpoints → Zustand store → Render components
```

## Key Design Decisions

### Dual Deployment Modes
- **Static Mode**: Pre-generated JSON files for reliable hackathon demos
- **Live Mode**: Real-time API for development and future production

### Wavelength-Matched Differencing
SPHEREx uses Linear Variable Filters (LVF), so the same sky position is observed at different wavelengths in different epochs. We only difference pairs where |Δλ| < 0.5 × bandwidth to avoid false positives from stellar spectral slopes.

### Dipole Pairing
Real moving objects produce paired positive/negative residuals in difference images. Isolated single-pixel events (cosmic rays, hot pixels) are rejected. This reduces false positives by ~90%.

### Sky Grid Indexing
- **Coverage Map**: 72×36 cells (5° each) for all-sky visualization
- **Detection Grid**: ~0.2° cells or HEALPix for fine-grained analysis
- Frames linked to cells via spatial join on footprints

## API Endpoints (Local Dev Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Pipeline status, frame counts, last ingest |
| `/api/coverage` | GET | 72×36 grid with epoch counts per cell |
| `/api/field?ra=&dec=` | GET | Frames grouped by epoch for a sky position |
| `/api/blink?ra=&dec=&band=` | GET | Ordered frames + difference PNGs for blink viewer |
| `/api/candidates` | GET | List of detected moving objects |
| `/api/candidates/{id}` | GET | Full candidate details |
| `/api/resolve?q=` | GET | Name/coordinate resolution |
| `/api/skybot?ra=&dec=&mjd=` | GET | Cached SkyBoT cross-match |

## Environment Variables

### Frontend (`.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_DATA_MODE=static  # or 'live'
```

### Backend (`backend/config.py`)
```python
IRSA_SIA2_URL = "https://irsa.ipac.caltech.edu/SIA"
SKYBOT_URL = "https://vo.imcce.fr/webservices/skybot/"
AWS_BUCKET = "nasa-irsa-spherex"
DETECTION_SIGMA_THRESHOLD = 5.0
WAVELENGTH_MATCH_TOLERANCE = 0.5  # fraction of bandwidth
```

## Performance Optimizations

1. **HTTP Range Requests**: Read FITS headers without downloading full 70MB files
2. **Cutout Caching**: On-disk cache keyed by (frame_id, ra, dec, size)
3. **JSON Pre-generation**: Static bundle avoids runtime API calls during demos
4. **Concurrency Limits**: Max 4 parallel requests to IRSA services
5. **Spatial Indexing**: R-tree index on frame footprints for fast cone searches

## Known Limitations

1. **SIA2 Lag**: New ingests appear in SIA2 ~1 day after release
2. **Wavelength Matching**: Some fields have no wavelength-matched pairs
3. **SkyBoT Completeness**: Only covers known solar system objects
4. **False Positives**: Diffraction spikes, latents, cosmic rays near bright stars
5. **Moving Object Sensitivity**: Detects ~0.5–5 arcsec/day motion range

## Citations

**SPHEREx Data**:
> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

**DOIs**:
- QR2 (current): `10.26131/IRSA652`
- QR1 (legacy): `10.26131/IRSA629`

**Services**:
- IRSA: https://irsa.ipac.caltech.edu
- SkyBoT: https://www.imcce.fr/skybot
- AWS Open Data: https://registry.opendata.aws/nasa-irsa-spherex
