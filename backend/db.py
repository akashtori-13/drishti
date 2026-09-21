"""
SpectraHunt Database Schema and Helpers

SQLite database for storing SPHEREx frames, candidates, and cross-matches.
Works in both live (FastAPI) and static bundle modes.
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

from backend.config import DATABASE_PATH as _DEFAULT_DB_PATH

# Grid dimensions (5° cells covering the full sky)
GRID_W = 72
GRID_H = 36

SCHEMA = """
-- Frames table: indexed SPHEREx observations
CREATE TABLE IF NOT EXISTS frames (
    frame_id TEXT PRIMARY KEY,
    obs_id TEXT NOT NULL,
    planning_period TEXT NOT NULL,
    detector INTEGER NOT NULL,              -- 1-6
    band INTEGER NOT NULL,                   -- 1-6
    survey TEXT NOT NULL DEFAULT 'Wide',     -- Wide or Deep
    mjd_obs REAL NOT NULL,
    ra_center REAL NOT NULL,
    dec_center REAL NOT NULL,
    footprint TEXT NOT NULL,                 -- JSON array of 4 corner coordinates
    s3_key TEXT,
    access_url TEXT,
    processing_version TEXT,
    ingested_at TEXT NOT NULL
);

-- Frame-to-cell mapping (many-to-many)
CREATE TABLE IF NOT EXISTS frame_cell_map (
    frame_id TEXT NOT NULL REFERENCES frames(frame_id) ON DELETE CASCADE,
    i INTEGER NOT NULL,                      -- cell column (0-71)
    j INTEGER NOT NULL,                      -- cell row (0-35)
    PRIMARY KEY (frame_id, i, j)
);

-- Candidates table: detected moving objects
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,                               -- Auto-generated: SH-<cell>-<n>
    ra REAL NOT NULL,
    dec REAL NOT NULL,
    band INTEGER NOT NULL,
    epoch_a TEXT NOT NULL,                   -- Planning period of first detection
    epoch_b TEXT NOT NULL,                   -- Planning period of second detection
    mjd_a REAL NOT NULL,
    mjd_b REAL NOT NULL,
    significance_sigma REAL NOT NULL,        -- Detection significance
    motion_arcsec REAL NOT NULL,             -- Total motion between epochs
    motion_pa_deg REAL,                      -- Position angle of motion
    skybot_match TEXT,                       -- Matched object name from SkyBoT
    status TEXT DEFAULT 'unreviewed',        -- unreviewed, real, artifact
    created_at TEXT NOT NULL,
    score_components TEXT                    -- JSON with scoring details
);

-- SkyBoT cache: avoid repeated queries
CREATE TABLE IF NOT EXISTS skybot_cache (
    ra REAL NOT NULL,
    dec REAL NOT NULL,
    mjd REAL NOT NULL,
    radius_arcsec REAL NOT NULL,
    result TEXT NOT NULL,                    -- JSON array of matches
    queried_at TEXT NOT NULL,
    PRIMARY KEY (ra, dec, mjd, radius_arcsec)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_frames_planning ON frames(planning_period);
CREATE INDEX IF NOT EXISTS idx_frames_ra_dec ON frames(ra_center, dec_center);
CREATE INDEX IF NOT EXISTS idx_frame_cell_i_j ON frame_cell_map(i, j);
CREATE INDEX IF NOT EXISTS idx_candidates_ra_dec ON candidates(ra, dec);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
"""


def init_db(db_path='spectrahunt.db'):
    """Initialize database with schema."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    # Status KV table used by API + pipeline (older schema had it)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ingest_status (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    # Enable WAL for concurrent reads during ingest/detect
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    conn.commit()
    conn.close()
    return db_path


def get_connection(db_path='spectrahunt.db'):
    """Get database connection with row factory."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def cell_of(ra, dec):
    """Convert RA/Dec to grid cell coordinates (i, j)."""
    i = min(GRID_W - 1, max(0, int(ra / 360.0 * GRID_W)))
    j = min(GRID_H - 1, max(0, int((90.0 - dec) / 180.0 * GRID_H)))
    return i, j


def get_coverage_counts(db_path='spectrahunt.db'):
    """Get epoch counts per grid cell."""
    conn = get_connection(db_path)

    # Initialize empty grid
    grid = [[0 for _ in range(GRID_W)] for _ in range(GRID_H)]

    try:
        # Count distinct planning periods per cell
        rows = conn.execute("""
            SELECT i, j, COUNT(DISTINCT planning_period) as count
            FROM frame_cell_map fcm
            JOIN frames f ON fcm.frame_id = f.frame_id
            GROUP BY i, j
        """).fetchall()

        for row in rows:
            i, j, count = row['i'], row['j'], row['count']
            if 0 <= i < GRID_W and 0 <= j < GRID_H:
                grid[j][i] = min(count, 5)  # Cap at 5+
    except Exception as e:
        print(f"Error getting coverage: {e}")
    finally:
        conn.close()

    return grid


def get_db_path() -> str:
    """Default database path (respects backend.config.DATABASE_PATH)."""
    return str(Path(_DEFAULT_DB_PATH).absolute())


def _round_key(x: float, ndigits: int = 4) -> float:
    try:
        return round(float(x), ndigits)
    except Exception:
        return x


def update_status(cur_or_db, key: str, value: Any):
    """Upsert a status KV pair. Accepts cursor or db path."""
    now = datetime.now(timezone.utc).isoformat()
    val = value if isinstance(value, str) else json.dumps(value)
    if isinstance(cur_or_db, str):
        conn = get_connection(cur_or_db)
        try:
            conn.execute("""
                INSERT INTO ingest_status (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """, (key, val, now))
            conn.commit()
        finally:
            conn.close()
        return
    cur_or_db.execute("""
        INSERT INTO ingest_status (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    """, (key, val, now))


def get_status(cur_or_db, key: str) -> Optional[Any]:
    """Get a status value by key. Accepts cursor or db path/connection."""
    try:
        if isinstance(cur_or_db, str):
            conn = get_connection(cur_or_db)
            try:
                row = conn.execute("SELECT value FROM ingest_status WHERE key = ?", (key,)).fetchone()
            finally:
                conn.close()
        elif isinstance(cur_or_db, sqlite3.Connection):
            row = cur_or_db.execute("SELECT value FROM ingest_status WHERE key = ?", (key,)).fetchone()
        else:  # cursor
            row = cur_or_db.execute("SELECT value FROM ingest_status WHERE key = ?", (key,)).fetchone()
        if not row:
            return None
        try:
            return json.loads(row["value"] if isinstance(row, sqlite3.Row) else row[0])
        except (json.JSONDecodeError, TypeError):
            return row["value"] if isinstance(row, sqlite3.Row) else row[0]
    except Exception:
        return None


def get_frames_for_cell(cur, cell_i: int, cell_j: int):
    """Get all frames covering a sky cell (cursor-based, legacy API)."""
    return cur.execute("""
        SELECT f.* FROM frames f
        JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
        WHERE fcm.i = ? AND fcm.j = ?
        ORDER BY f.mjd_obs
    """, (cell_i, cell_j)).fetchall()


def _row_to_candidate_dict(row) -> Dict[str, Any]:
    d = dict(row)
    # Normalize skybot_match (may be JSON string or plain name)
    sm = d.get("skybot_match")
    if sm:
        try:
            parsed = json.loads(sm)
            d["skybot_match"] = parsed.get("name") if isinstance(parsed, dict) else parsed
        except (json.JSONDecodeError, TypeError):
            pass
    # Normalize thumb_urls if present as JSON text
    tu = d.get("thumb_urls")
    if isinstance(tu, str):
        try:
            d["thumb_urls"] = json.loads(tu)
        except json.JSONDecodeError:
            d["thumb_urls"] = []
    if d.get("thumb_urls") is None:
        d["thumb_urls"] = []
    return d


def get_candidates(cur_or_db, since=None, band=None, status=None, limit: int = 100):
    """Query candidates with optional filters. Accepts cursor or db path."""
    query = "SELECT * FROM candidates WHERE 1=1"
    params: list = []
    if since:
        query += " AND created_at >= ?"
        params.append(since)
    if band is not None:
        query += " AND band = ?"
        params.append(band)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY significance_sigma DESC, created_at DESC LIMIT ?"
    params.append(limit)
    if isinstance(cur_or_db, str):
        conn = get_connection(cur_or_db)
        try:
            rows = conn.execute(query, params).fetchall()
        finally:
            conn.close()
        return [_row_to_candidate_dict(r) for r in rows]
    rows = cur_or_db.execute(query, params).fetchall()
    # If cursor rows are sqlite3.Row, convert; callers expecting Rows still get dicts here
    try:
        return [_row_to_candidate_dict(r) for r in rows]
    except Exception:
        return rows


def get_candidate_by_id(cur_or_db, candidate_id) -> Optional[Dict[str, Any]]:
    """Get a single candidate by id."""
    if isinstance(cur_or_db, str):
        conn = get_connection(cur_or_db)
        try:
            row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
        finally:
            conn.close()
    else:
        row = cur_or_db.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    return _row_to_candidate_dict(row) if row else None


def cache_skybot_result(cur_or_db, ra: float, dec: float, mjd: float, radius: float, result):
    """Cache a SkyBoT result. Rounds float keys to avoid exact-match misses."""
    ra_r, dec_r, mjd_r = _round_key(ra), _round_key(dec), _round_key(mjd, 3)
    now = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(result)
    sql = """
        INSERT INTO skybot_cache (ra, dec, mjd, radius_arcsec, result, queried_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ra, dec, mjd, radius_arcsec) DO UPDATE SET
            result=excluded.result, queried_at=excluded.queried_at
    """
    if isinstance(cur_or_db, str):
        conn = get_connection(cur_or_db)
        try:
            conn.execute(sql, (ra_r, dec_r, mjd_r, radius, payload, now))
            conn.commit()
        finally:
            conn.close()
        return
    cur_or_db.execute(sql, (ra_r, dec_r, mjd_r, radius, payload, now))


def get_cached_skybot(cur_or_db, ra: float, dec: float, mjd: float, radius: float):
    """Fetch cached SkyBoT result or None."""
    ra_r, dec_r, mjd_r = _round_key(ra), _round_key(dec), _round_key(mjd, 3)
    sql = "SELECT result FROM skybot_cache WHERE ra=? AND dec=? AND mjd=? AND radius_arcsec=?"
    if isinstance(cur_or_db, str):
        conn = get_connection(cur_or_db)
        try:
            row = conn.execute(sql, (ra_r, dec_r, mjd_r, radius)).fetchone()
        finally:
            conn.close()
    elif isinstance(cur_or_db, sqlite3.Connection):
        row = cur_or_db.execute(sql, (ra_r, dec_r, mjd_r, radius)).fetchone()
    else:
        row = cur_or_db.execute(sql, (ra_r, dec_r, mjd_r, radius)).fetchone()
    if not row:
        return None
    raw = row["result"] if isinstance(row, sqlite3.Row) else row[0]
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


if __name__ == '__main__':
    import sys
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'spectrahunt.db'
    init_db(db_path)
    print(f"Database initialized: {db_path}")
