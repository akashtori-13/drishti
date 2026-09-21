"""
SpectraHunt local cache (SQLite scratch).

Stores SkyBoT responses, TAP discovery results, and pipeline status so repeated
runs don't hammer IRSA. Git-ignored; the deployed site never reads this.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skybot_cache (
    ra REAL NOT NULL,
    dec REAL NOT NULL,
    mjd REAL NOT NULL,
    radius_arcsec REAL NOT NULL,
    result TEXT NOT NULL,
    queried_at TEXT NOT NULL,
    PRIMARY KEY (ra, dec, mjd, radius_arcsec)
);
CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def init_db(db_path: str = "data/spectrahunt.db") -> str:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    conn.commit()
    conn.close()
    return db_path


def get_connection(db_path: str = "data/spectrahunt.db") -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _round(x: float, ndigits: int = 4) -> float:
    try:
        return round(float(x), ndigits)
    except Exception:
        return x


def set_status(db_path: str, key: str, value: Any) -> None:
    now = datetime.now(timezone.utc).isoformat()
    val = value if isinstance(value, str) else json.dumps(value)
    conn = get_connection(db_path)
    try:
        conn.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, val, now),
        )
        conn.commit()
    finally:
        conn.close()


def get_status(db_path: str, key: str) -> Optional[Any]:
    conn = get_connection(db_path)
    try:
        row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return row["value"]


def cache_skybot(db_path: str, ra: float, dec: float, mjd: float, radius: float, result: Any) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection(db_path)
    try:
        conn.execute(
            "INSERT INTO skybot_cache (ra, dec, mjd, radius_arcsec, result, queried_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(ra, dec, mjd, radius_arcsec) DO UPDATE SET result=excluded.result, queried_at=excluded.queried_at",
            (_round(ra), _round(dec), _round(mjd, 3), radius, json.dumps(result), now),
        )
        conn.commit()
    finally:
        conn.close()


def get_cached_skybot(db_path: str, ra: float, dec: float, mjd: float, radius: float) -> Optional[Any]:
    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT result FROM skybot_cache WHERE ra=? AND dec=? AND mjd=? AND radius_arcsec=?",
            (_round(ra), _round(dec), _round(mjd, 3), radius),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        return json.loads(row["result"])
    except (json.JSONDecodeError, TypeError):
        return None


def _api_age_s(updated_at: str) -> float:
    try:
        dt = datetime.fromisoformat(updated_at)
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return float("inf")


def api_cache_get(db_path: str, key: str, max_age_s: int) -> Optional[Any]:
    """TTL cache for expensive pipeline products (discovery, photometry, gaia)."""
    conn = get_connection(db_path)
    try:
        row = conn.execute("SELECT value, updated_at FROM api_cache WHERE key=?", (key,)).fetchone()
    finally:
        conn.close()
    if not row or _api_age_s(row["updated_at"]) > max_age_s:
        return None
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return None


def api_cache_set(db_path: str, key: str, value: Any) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection(db_path)
    try:
        conn.execute(
            "INSERT INTO api_cache (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, json.dumps(value, default=float), now),
        )
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    print(f"Cache initialized: {init_db(sys.argv[1] if len(sys.argv) > 1 else 'data/spectrahunt.db')}")
