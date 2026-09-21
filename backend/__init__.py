"""SpectraHunt Backend Package."""

from backend.config import RELEASE, DOI, PIPELINE_VERSION, BANDS, GRID_W, GRID_H, CITATION_TEXT
from backend.db import init_db, get_connection

__version__ = "1.0.0"
__all__ = ["RELEASE", "DOI", "PIPELINE_VERSION", "BANDS", "GRID_W", "GRID_H",
           "CITATION_TEXT", "init_db", "get_connection"]
