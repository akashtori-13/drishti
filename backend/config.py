"""
SpectraHunt Backend Configuration

All constants, endpoints, thresholds and configuration live here.
No magic numbers scattered in the code.
"""

# SPHEREx QR2 release info
RELEASE = "QR2"
RELEASE_DOI = "10.26131/IRSA652"  # QR2 current (QR1 is 10.26131/IRSA629)
PIPELINE_VERSION = "v1.0.0"

# IRSA / AWS endpoints
IRSA_SIA2_ENDPOINT = "https://irsa.ipac.caltech.edu/SIA"
IRSA_TAP_ENDPOINT = "https://irsa.ipac.caltech.edu/TAP"
IRSA_CUTOUT_BASE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2"
AWS_BUCKET = "nasa-irsa-spherex"
AWS_REGION = "us-east-1"
AWS_PREFIX = "qr2/level2"

# SIA2 collections
SIA2_COLLECTION_WIDE = "spherex_qr2"
SIA2_COLLECTION_DEEP = "spherex_qr2_deep"
SIA2_COLLECTION_CAL = "spherex_qr2_cal"

# SkyBoT endpoint (IMCCE)
SKYBOT_ENDPOINT = "https://vo.imcce.fr/webservices/skybot/"

# Band definitions (SPHEREx LVF bands)
BANDS = [
    {"id": 1, "label": "Band 1", "range_um": (0.75, 1.09), "R": 39, "color": "#7c83fd"},
    {"id": 2, "label": "Band 2", "range_um": (1.10, 1.62), "R": 41, "color": "#5aa9e6"},
    {"id": 3, "label": "Band 3", "range_um": (1.63, 2.41), "R": 41, "color": "#4fc9a8"},
    {"id": 4, "label": "Band 4", "range_um": (2.42, 3.82), "R": 35, "color": "#e8c34a"},
    {"id": 5, "label": "Band 5", "range_um": (3.83, 4.41), "R": 112, "color": "#f08a4b"},
    {"id": 6, "label": "Band 6", "range_um": (4.42, 5.00), "R": 128, "color": "#e85d4a"},
]

# Detector properties
DETECTOR_PIXELS = 2040  # image HDU is 2040x2040
PIXEL_SCALE_ARCSEC = 6.2  # nominal pixel scale

# Detection pipeline thresholds
DETECTION_SIGMA_THRESHOLD = 5.0  # SEP extraction threshold in sigma
DIPOLE_MAX_SEPARATION_ARCSEC = 30.0  # max separation for dipole pairing
DIPOLE_MAX_MOTION_ARCSEC_PER_DAY = 1000.0  # physically plausible motion cap
SKYBOT_MATCH_RADIUS_ARCSEC = 10.0  # cross-match radius for SkyBoT
WAVELENGTH_MATCH_TOLERANCE_FACTOR = 0.5  # |Δλ| < 0.5 × CBAND for wavelength matching

# Cutout settings
CUTOUT_SIZE_DEG = 0.15  # cutout size in degrees (~9 arcmin)
CUTOUT_CACHE_DIR = "data/cutouts"
PNG_CACHE_DIR = "data/img"

# Coverage grid (matches front-end)
GRID_W = 72
GRID_H = 36
CELL_SIZE_DEG = 5.0

# Ingest settings
MAX_CONCURRENT_IRSA_REQUESTS = 4
INGEST_TIMEOUT_SECONDS = 30
USER_AGENT = "SpectraHunt/1.0.0 (NASA Space Apps Challenge 2026; astrophysics moving-object detection)"

# Database
DATABASE_PATH = "data/spectrahunt.db"

# API settings
API_HOST = "0.0.0.0"
API_PORT = 8000
CORS_ORIGINS = ["*"]

# FLAGS bitmask interpretation (from SPHEREx Explanatory Supplement)
# These bits indicate bad/unusable pixels
FLAGS_BAD_BITS = [0, 1, 2, 3, 7]  # verify from documentation
FLAGS_BAD_MASK = sum(1 << b for b in FLAGS_BAD_BITS)

# Required citation text
CITATION_TEXT = """This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration."""
