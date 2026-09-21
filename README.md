# SpectraHunt

**NASA Space Apps Challenge 2026** - Advanced Track: Astrophysics / Planets & Moons / Software

SpectraHunt compares repeated SPHEREx passes of the same patch of sky and flags what moved or changed: comets, asteroids, and variable stars.

## Quick Start

### Static Mode (Recommended for Demo)

```bash
# Install dependencies
pip install -r requirements.txt

# Build static bundle with real SPHEREx data
python scripts/build_static_bundle.py --region "180,0,5" --max-frames 100

# Serve locally
cd data && python -m http.server 8000

# Open http://localhost:8000 in your browser
```

### Live Mode (FastAPI Backend)

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database
python -c "from backend.db import init_db; init_db('spectrahunt.db')"

# Run ingestion
python -m backend.ingest --db spectrahunt.db --ra 180 --dec 0 --radius 5 --max-frames 100

# Run detection
python -m backend.detect --db spectrahunt.db --ra 180 --dec 0 --radius 5

# Start API server
uvicorn backend.app:app --host 0.0.0.0 --port 8000

# Open http://localhost:8000/docs for API documentation
```

## Deployment to Netlify

SpectraHunt is configured for automatic deployment to Netlify via `netlify.toml`:

1. **Push to GitHub**: Commit your code to a GitHub repository
2. **Connect to Netlify**: 
   - Go to [Netlify](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Select your GitHub repository
3. **Deploy**: Netlify will automatically:
   - Install Python dependencies
   - Run the static bundle builder
   - Publish the `data/` directory

The site will be live at `https://your-site-name.netlify.app`

### Manual Deploy (Netlify CLI)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
python scripts/build_static_bundle.py --region "180,0,5" --max-frames 100
netlify deploy --prod --dir=data
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
├── index.html                 # Front-end (vanilla JS, no framework)
├── netlify.toml              # Netlify deployment config
├── requirements.txt          # Python dependencies
├── README.md                 # This file
├── scripts/
│   └── build_static_bundle.py  # Static site generator
├── backend/
│   ├── config.py             # Constants and endpoints
│   ├── db.py                 # Database schema and helpers
│   ├── ingest.py             # SIA2 frame discovery
│   ├── detect.py             # Difference imaging pipeline
│   ├── cutouts.py            # FITS cutout processing
│   ├── crossmatch.py         # SkyBoT/Horizons integration
│   └── app.py                # FastAPI REST API
└── data/                     # Generated static files
    ├── index.html
    ├── status.json
    ├── coverage.json
    ├── candidates.json
    ├── demo_fields.json
    └── spectrahunt.db
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
