"""
SpectraHunt Backend Package

Real SPHEREx data pipeline for moving object detection.
"""

from .config import (
    RELEASE, RELEASE_DOI, PIPELINE_VERSION,
    BANDS, GRID_W, GRID_H, CITATION_TEXT
)
from .db import init_db, get_connection

__version__ = "1.0.0"
__all__ = [
    "RELEASE", "RELEASE_DOI", "PIPELINE_VERSION",
    "BANDS", "GRID_W", "GRID_H", "CITATION_TEXT",
    "init_db", "get_connection"
]
