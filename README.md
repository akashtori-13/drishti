# SpectraHunt

**Hunt what moves in the infrared sky** — A web tool for detecting moving objects and transients in SPHEREx data.

Built for the 2026 NASA Space Apps Challenge (Advanced Track: Astrophysics / Planets & Moons / Software).

## Quick Start

### Static Bundle Mode (Recommended for Demo)

This mode works with no backend server — ideal for GitHub Pages, Netlify, or local demo.

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Build static bundle with real SPHEREx data
python scripts/build_static_bundle.py --region "180,0,2" --max-frames 50

# 3. Serve locally (or deploy to static hosting)
python -m http.server 8000

# 4. Open http://localhost:8000 in your browser
```

### Live API Mode

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Initialize database and run ingestion
python -c "from backend.db import init_db; init_db()"
python backend/ingest.py --ra 180 --dec 0 --radius 2 --max-frames 50

# 3. Run detection pipeline
python backend/detect.py

# 4. Start FastAPI server
uvicorn backend.app:app --host 0.0.0.0 --port 8000

# 5. Open http://localhost:8000/docs for API docs
```

## Data Sources

| Source | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| IRSA SIA2 | `https://irsa.ipac.caltech.edu/SIA` | Frame discovery | Verified |
| IRSA TAP | `https://irsa.ipac.caltech.edu/TAP` | Alternative frame indexing | Probe to verify |
| SkyBoT | `https://vo.imcce.fr/webservices/skybot/` | Solar system cross-match | Verified |
| AWS Open Data | `s3://nasa-irsa-spherex` | Direct FITS access | Optional |

**Note:** SIA2 lags new ingests by ~1 day. For freshest data, use AWS S3 listing.

## Architecture

```
IRSA SIA2/TAP → ingest.py → SQLite DB → detect.py → candidates
                                              ↓
                              FastAPI (/api/*) or static JSON
                                              ↓
                                        index.html
```

### Two Deployment Modes

1. **Live Mode**: Python FastAPI backend + SQLite database
   - Real-time queries to IRSA
   - On-demand detection
   - Requires server infrastructure

2. **Static Bundle Mode**: Pre-generated JSON files
   - No backend needed
   - Works on GitHub Pages / Netlify
   - Data is real but pre-computed
   - Recommended for hackathon demo

## Configuration

All constants live in `backend/config.py`:

- Endpoints (IRSA, SkyBoT, AWS)
- Detection thresholds (σ, wavelength tolerance)
- Band definitions
- Grid dimensions (72×36 cells, 5° each)

**No magic numbers scattered in code.**

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Release info, ingest stats |
| `GET /api/coverage` | Sky coverage grid |
| `GET /api/field?ra=&dec=` | Field metadata |
| `GET /api/blink?ra=&dec=&band=` | Blink frames |
| `GET /api/candidates` | Candidate list |
| `GET /api/resolve?q=` | Name/coordinate resolution |
| `GET /api/skybot?ra=&dec=&mjd=` | SkyBoT cross-match |

## Detection Pipeline

The pipeline (`backend/detect.py`) performs:

1. **Wavelength matching**: Only difference epochs where the LVF wavelength at the target position agrees within 0.5× bandwidth
2. **Background subtraction**: SEP Background2D
3. **Difference imaging**: B−A for matched pairs
4. **Source extraction**: SEP at 5σ threshold
5. **Dipole pairing**: Match positive/negative blobs
6. **SkyBoT cross-match**: Identify known solar system objects
7. **Scoring**: Significance + dipole quality + multi-pair agreement

### Known Limitations

- **Wavelength matching**: Many epoch pairs won't match due to LVF design. Cells may show "no wavelength-matched epochs".
- **Sparse epochs**: SPHEREx covers the whole sky every ~6 months. Many fields have only 1-2 epochs.
- **False positives**: Cosmic rays, diffraction spikes, and latents can create dipole-like artifacts.
- **SkyBoT completeness**: Only catalogs known objects. New discoveries won't match.

## Validation

### Recovery Test

Run on the 3I/ATLAS field (position from Horizons):

```bash
python scripts/build_static_bundle.py --region "RA,DEC,2"
```

Check if 3I/ATLAS is recovered in candidates with SkyBoT match.

### False Positive Check

Run on high-latitude empty fields:

```bash
python backend/detect.py --cell-i 36 --cell-j 5  # Example off-ecliptic cell
```

Expected: Few or no candidates.

## Deployment

### Static Hosting (GitHub Pages / Netlify) - RECOMMENDED

The static bundle mode is the most reliable for demos and hackathons.

```bash
# Build bundle (this generates data/ directory with all files)
python scripts/build_static_bundle.py --region "180,0,2" --max-frames 50

# The script automatically copies index.html to data/
# Just deploy the entire data/ folder to your hosting
```

**Netlify:**
1. Connect your GitHub repository
2. Set build command: `pip install -r requirements.txt && python scripts/build_static_bundle.py --region "180,0,2" --max-frames 50`
3. Set publish directory: `data`
4. Deploy! The `netlify.toml` file handles all configuration automatically.

**GitHub Pages:**
```bash
# Build to docs folder
python scripts/build_static_bundle.py --output docs --region "180,0,2" --max-frames 50

# Push docs/ to gh-pages branch or use GitHub Actions
```

### Docker (Live Mode)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t spectrahunt .
docker run -p 8000:8000 spectrahunt
```

### Cron Job (Daily Ingest)

```cron
0 2 * * * cd /path/to/spectrahunt && python backend/ingest.py --max-frames 100
0 3 * * * cd /path/to/spectrahunt && python backend/detect.py
```

## Citation

> This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.

**DOIs:**
- QR2 (current): `10.26131/IRSA652`
- QR1 (legacy): `10.26131/IRSA629`

## What Is Real vs. Limitation

| Feature | Status | Notes |
|---------|--------|-------|
| Coverage map | Real | From indexed frames |
| Epoch counts | Real | Distinct planning periods |
| Candidates | Real | From detection pipeline |
| SkyBoT matches | Real | Cached queries |
| Blink images | Static bundle | Pre-rendered PNGs |
| Wavelength matching | Implemented | May reject many pairs |
| Full-sky index | Limited | Sample regions only in demo |
| 3I/ATLAS recovery | To verify | Depends on actual coverage |

## Development

```bash
# Run probe script to verify endpoints
python scripts/probe_endpoints.py

# Run tests
pytest backend/tests/

# Format code
# (Add your preferred formatter)
```

## License

MIT License — see LICENSE file.

## Credits

- SPHEREx mission team (JPL/Caltech)
- IRSA/IPAC for data archive and tools
- IMCCE for SkyBoT
- NASA Space Apps Challenge 2026
