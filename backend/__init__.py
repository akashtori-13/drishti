"""STELLAR backend: TAP discovery + IBE cutouts + cross-match (dev API)."""

from backend.cache import get_connection, init_db
from backend.config import BANDS, CITATION_TEXT, DOI, PIPELINE_VERSION, RELEASE

__version__ = "1.0.0"
__all__ = ["RELEASE", "DOI", "PIPELINE_VERSION", "BANDS", "CITATION_TEXT",
           "init_db", "get_connection"]
