"""
SpectraHunt Configuration

All constants, endpoints, and thresholds in one place.
No magic numbers scattered in the code.
"""

# Data release
RELEASE = 'QR2'
DOI = '10.26131/IRSA652'  # QR2 DOI (QR1: 10.26131/IRSA629)
RELEASE_DOI = DOI  # alias used by older backend modules
PIPELINE_VERSION = '1.0.0'

# IRSA Endpoints
IRSA_SIA2_URL = 'https://irsa.ipac.caltech.edu/SIA'
IRSA_TAP_URL = 'https://irsa.ipac.caltech.edu/TAP'
IRSA_CUTOUT_BASE = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2'
IRSA_SIA2_COLLECTION = 'spherex_qr2'  # Wide survey (primary)
IRSA_DEEP_COLLECTION = 'spherex_qr2_deep'

# AWS Open Data (unsigned requests)
AWS_BUCKET = 'nasa-irsa-spherex'
AWS_REGION = 'us-east-1'
AWS_PREFIX = 'qr2/level2'

# SkyBoT (IMCCE) for solar system object cross-match
SKYBOT_URL = 'http://vo.imcce.fr/webservices/skybot/'
SKYBOT_RADIUS_ARCSEC = 10.0  # Default search radius

# SPHEREx detector/band definitions
BANDS = [
    {'id': 1, 'label': 'Band 1', 'range': '0.75–1.09 µm', 'R': 39},
    {'id': 2, 'label': 'Band 2', 'range': '1.10–1.62 µm', 'R': 41},
    {'id': 3, 'label': 'Band 3', 'range': '1.63–2.41 µm', 'R': 41},
    {'id': 4, 'label': 'Band 4', 'range': '2.42–3.82 µm', 'R': 35},
    {'id': 5, 'label': 'Band 5', 'range': '3.83–4.41 µm', 'R': 112},
    {'id': 6, 'label': 'Band 6', 'range': '4.42–5.00 µm', 'R': 128},
]

# Detector specs
DETECTOR_PIXELS = (2040, 2040)  # Image HDU dimensions
PIXEL_SCALE_ARCSEC = 6.2  # Arcseconds per pixel
PSF_FWHM_ARCSEC = 6.0  # Approximate PSF FWHM

# Detection pipeline thresholds
DETECTION_SIGMA_THRESHOLD = 5.0  # Minimum significance for SEP extraction
DIPOLE_MAX_SEPARATION_ARCSEC = 30.0  # Max separation for dipole pairing
WAVELENGTH_MATCH_TOLERANCE = 0.5  # Tolerance factor for wavelength matching (fraction of bandwidth)
FLAGS_BAD_BITS = [0, 1, 2, 4, 8]  # Bad pixel flag bits (from SPHEREx Explanatory Supplement)

# Grid dimensions
GRID_W = 72  # 5° cells in RA (360/5)
GRID_H = 36  # 5° cells in Dec (180/5)

# API configuration
API_CONCURRENCY_LIMIT = 4  # Max concurrent requests to IRSA
MAX_CONCURRENT_IRSA_REQUESTS = API_CONCURRENCY_LIMIT
API_TIMEOUT_SECONDS = 30
INGEST_TIMEOUT_SECONDS = API_TIMEOUT_SECONDS
USER_AGENT = 'SpectraHunt/1.0 (NASA Space Apps 2026; github.com/your-org/spectrahunt)'

# SkyBoT endpoint alias (older modules import SKYBOT_ENDPOINT)
SKYBOT_ENDPOINT = SKYBOT_URL

# Cutouts
CUTOUT_SIZE_DEG = 0.15  # ~9 arcmin cutouts

# Cache directories
CACHE_DIR = '.cache'
CUTOUT_CACHE_DIR = '.cache/cutouts'
PNG_CACHE_DIR = '.cache/pngs'

# Database (default location; callers may override with explicit path)
DATABASE_PATH = 'data/spectrahunt.db'

# API server
API_HOST = '0.0.0.0'
API_PORT = 8000
CORS_ORIGINS = ['*']

# FLAGS bitmask (SPHEREx Explanatory Supplement)
FLAGS_BAD_MASK = sum(1 << b for b in FLAGS_BAD_BITS)

# Pipeline version
PIPELINE_VERSION = '1.0.0'

# Citation text (required by SPHEREx)
CITATION_TEXT = """
This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.
""".strip()
