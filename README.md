# SpectraHunt

**NASA Space Apps Challenge 2026** - Advanced Track: Astrophysics / Planets & Moons / Software

SpectraHunt detects moving objects (asteroids, comets, NEOs) in SPHEREx astronomical survey data using difference imaging and machine learning.

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Zustand, React-Leaflet, Recharts
- **Backend**: Python FastAPI, SQLite, astropy, astroquery, sep, reproject
- **Deployment**: Netlify (static export `spectrahunt-web/out`), uvicorn locally (live mode)

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system architecture.

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- pip

### Local Development

```bash
# Install frontend dependencies
cd spectrahunt-web
npm install

# Install Python dependencies
cd ..
pip install -r requirements.txt

# Generate static data (real SPHEREx data)
python scripts/build_static_bundle.py --region "180,0,2" --max-frames 50

# Copy data to public folder
cp data/*.json spectrahunt-web/public/

# Set environment variables
echo "NEXT_PUBLIC_DATA_MODE=static" > spectrahunt-web/.env.local

# Start Next.js dev server
cd spectrahunt-web
npm run dev

# Open http://localhost:3000
```

### Live API Mode (Advanced)

```bash
# Initialize database
python -c "from backend.db import init_db; init_db()"

# Run ingestion
python -m backend.ingest --ra 180 --dec 0 --radius 2 --max-frames 50

# Run detection
python -m backend.detect

# Start FastAPI server
uvicorn backend.app:app --host 0.0.0.0 --port 8000

# Configure frontend for live mode
cd spectrahunt-web
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local
echo "NEXT_PUBLIC_DATA_MODE=live" >> .env.local
npm run dev
```

## Deployment to Netlify

SpectraHunt is configured for automatic deployment to Netlify via `netlify.toml`:

### Automatic Deployment

1. **Push to GitHub**: Commit your code to a GitHub repository
2. **Connect to Netlify** with base directory `spectrahunt-web/`, build `npm ci && npm run build`, publish `spectrahunt-web/out`
3. **Deploy**: Netlify builds the static Next.js export and serves global CDN. No Python/IRSA calls at CDN build time — `spectrahunt-web/public/data/*.json` is committed (regenerate locally via `python scripts/build_static_bundle.py` + copy to `public/data/`).

Your site will be live at `https://your-site-name.netlify.app`

### Manual Deploy (Netlify CLI)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
cd spectrahunt-web
npm ci && npm run build
netlify deploy --prod --dir=.next
```

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd spectrahunt-web
vercel --prod
```

## Data Sources

- **SPHEREx QR2**: NASA/IPAC Infrared Science Archive (IRSA)
  - DOI: [`10.26131/IRSA652`](https://doi.org/10.26131/IRSA652)
  - Access: [IRSA SIA2](https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr2)
  - AWS Open Data: `s3://nasa-irsa-spherex/qr2/`
  
- **SkyBoT**: IMCCE solar system object database
  - Endpoint: `http://vo.imcce.fr/webservices/skybot/`
  
- **CDS Sesame**: Astronomical object name resolution
  - Used for fixed targets (nebulae, stars, galaxies)

## Required Citation

This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

## Architecture

### Static Bundle Mode (Default)
- Pre-computed JSON files (`status.json`, `coverage.json`, `candidates.json`)
- No backend required
- Works on GitHub Pages, Netlify, Vercel
- Ideal for hackathon demos

### Live Mode
- FastAPI backend with SQLite database
- Real-time SIA2 queries to IRSA
- On-demand detection pipeline
- Scheduled daily ingest via APScheduler

## File Structure

```
spectrahunt/
├── README.md                 # This file
├── ARCHITECTURE.md           # System architecture documentation
├── netlify.toml              # Netlify deployment configuration
├── requirements.txt          # Python dependencies
├── .gitignore                # Git ignore rules
│
├── spectrahunt-web/          # Next.js frontend application
│   ├── src/
│   │   ├── app/              # App Router pages and layouts
│   │   ├── components/       # Reusable React components
│   │   ├── store/            # Zustand state management
│   │   ├── lib/              # Utility functions
│   │   └── types/            # TypeScript type definitions
│   ├── public/               # Static assets (JSON data, images)
│   ├── package.json          # Node.js dependencies
│   ├── tsconfig.json         # TypeScript configuration
│   ├── tailwind.config.ts    # Tailwind CSS configuration
│   └── next.config.mjs       # Next.js configuration
│
├── backend/                  # Python backend (local development only)
│   ├── __init__.py
│   ├── app.py                # FastAPI REST API
│   ├── config.py             # Configuration constants
│   ├── db.py                 # SQLite database schema
│   ├── ingest.py             # SPHEREx frame ingestion
│   ├── detect.py             # Moving object detection pipeline
│   ├── cutouts.py            # FITS cutout processing
│   ├── crossmatch.py         # SkyBoT/Horizons cross-matching
│   └── tests/                # Unit and integration tests
│
├── scripts/                  # Build and utility scripts
│   ├── build_static_bundle.py    # Generate static JSON files
│   └── probe_endpoints.py        # Verify external API endpoints
│
└── data/                   # Generated static data for deployment
    ├── status.json         # Pipeline status and statistics
    ├── coverage.json       # 72×36 sky grid coverage counts
    ├── candidates.json     # Detected moving objects
    ├── demo_fields.json    # Pre-computed field data
    ├── spectrahunt.db      # SQLite database
    └── img/                # Rendered PNG cutouts
```

## API Endpoints (Live Mode)

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Release info, counts, last ingest time |
| `GET /api/coverage` | 72×36 grid with epoch counts per cell |
| `GET /api/candidates` | List of detected moving objects |
| `GET /api/field?ra=&dec=` | Frames covering a position |
| `GET /api/blink?ra=&dec=&band=` | Ordered frames for blink viewer |
| `GET /api/resolve?q=` | Name/coordinate resolution |
| `GET /api/skybot?ra=&dec=&mjd=` | Cached SkyBoT lookup |

## Detection Pipeline

1. **Wavelength Matching**: Only difference pairs whose wavelength at the target position agrees within the local bandwidth (critical due to SPHEREx linear variable filters)
2. **Background Subtraction**: Remove zodiacal light model and residual smooth background
3. **Difference Imaging**: Subtract consecutive epochs
4. **Source Extraction**: SEP algorithm at 5σ threshold
5. **Dipole Pairing**: Match positive-negative source pairs (moving object signature)
6. **Scoring**: Significance, dipole quality, multi-band agreement
7. **Cross-Match**: SkyBoT query for known solar system objects

### Known Limitations

- **Wavelength Matching**: Same-band observations may still have different wavelengths due to LVF position; some valid pairs may be rejected
- **Sparse Epochs**: SPHEREx covers the whole sky every ~6 months; many cells have only 1-2 epochs
- **False Positives**: Cosmic rays, diffraction spikes, and latents can trigger detections
- **SkyBoT Completeness**: Only matches known objects; newly discovered movers won't have matches
- **IRSA SIA2 Lag**: New ingests take ~1 day to appear in SIA2 queries

## Testing

```bash
# Run unit tests
pytest backend/tests/ -v

# Test specific module
python -m pytest backend/tests/test_backend.py::test_coordinate_parsing -v
```

## Troubleshooting

### "SIA2 query failed"
- IRSA services may be temporarily unavailable
- Try reducing the search radius
- Use pre-generated static bundle for demo

### "Address already in use"
```bash
# Kill existing server
pkill -f "python.*http.server"

# Or use a different port
python -m http.server 8080
```

### Empty coverage grid
- Ingestion found no frames (IRSA outage or region has no coverage)
- Try a different region (ecliptic plane has most coverage)
- Increase search radius

## Demo Day Checklist

- [ ] Pre-build static bundle with `--region "180,0,5"` (ecliptic plane)
- [ ] Verify all JSON files are present in `data/`
- [ ] Test locally at `http://localhost:8000`
- [ ] Have offline fallback ready (static bundle doesn't need network)
- [ ] Prepare talking points about wavelength matching limitation
- [ ] Cite SPHEREx properly in presentation

## License

MIT License - see LICENSE file

## Acknowledgments

Built for NASA Space Apps Challenge 2026. Uses SPHEREx QR2 data from IRSA/IPAC.
