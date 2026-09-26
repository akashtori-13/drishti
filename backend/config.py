"""
DRISHTI configuration.

Single place for releases, IRSA endpoints, bands, and pipeline tuning.
"""

# Data release
RELEASE = "QR2"
DOI = "10.26131/IRSA652"
PIPELINE_VERSION = "1.0.0"

# IRSA endpoints
TAP_URL = "https://irsa.ipac.caltech.edu/TAP"
SIA2_URL = "https://irsa.ipac.caltech.edu/SIA"
IRSA_VIEWER_URL = "https://irsa.ipac.caltech.edu/irsaviewer/"
COLLECTION_WIDE = "spherex_qr2"

# SkyBoT (IMCCE) solar-system cross-match
SKYBOT_URL = "https://vo.imcce.fr/webservices/skybot/"
SKYBOT_RADIUS_ARCSEC = 10.0

# SPHEREx bands: id, LVF range, resolving power, representative wavelength
BANDS = [
    {"id": 1, "range_um": (0.75, 1.09), "R": 39, "wave_um": 0.92},
    {"id": 2, "range_um": (1.10, 1.62), "R": 41, "wave_um": 1.36},
    {"id": 3, "range_um": (1.63, 2.41), "R": 41, "wave_um": 2.02},
    {"id": 4, "range_um": (2.42, 3.82), "R": 35, "wave_um": 3.12},
    {"id": 5, "range_um": (3.83, 4.41), "R": 112, "wave_um": 4.12},
    {"id": 6, "range_um": (4.42, 5.00), "R": 128, "wave_um": 4.71},
]
BANDPASS_NAMES = {b["id"]: f"SPHEREx-D{b['id']}" for b in BANDS}

# Detector
PIXEL_SCALE_ARCSEC = 6.2

# LVF rule: two cutouts blink together only if |Δλ| < 0.5 × mean bandwidth
WAVELENGTH_TOLERANCE_FACTOR = 0.5

# Cutouts
CUTOUT_SIZE_DEG = 0.05  # 3 arcmin default; fast IBE responses
CUTOUT_CACHE_DIR = ".cache/cutouts"
PNG_CACHE_DIR = ".cache/pngs"
PUBLIC_CUTOUT_DIR = "spectrahunt-web/public/cutouts"

# Network
API_TIMEOUT_SECONDS = 30
USER_AGENT = "DRISHTI/2.0 (NASA Space Apps 2026)"

# Local scratch (git-ignored). Never required at runtime.
DATABASE_PATH = "data/spectrahunt.db"

# Dev API server. Binds loopback by default; CORS pinned to the local
# frontends (audit: no wildcard, no credentialed-wildcard combo).
API_HOST = "127.0.0.1"
API_PORT = 8000
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000",
                "http://localhost:8000", "http://127.0.0.1:8000",
                "capacitor://localhost", "tauri://localhost"]

CITATION_TEXT = (
    "This publication makes use of data products from the Spectro-Photometer "
    "for the History of the Universe, Epoch of Reionization and Ices Explorer "
    "(SPHEREx), a joint project of JPL and Caltech funded by NASA."
)
