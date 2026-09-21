"""
Database schema and helpers for SpectraHunt.

SQLite with spatial indexing via PostGIS-style bounding box columns.
Schema:
  - frames: indexed SPHEREx frame metadata
  - frame_cell_map: many-to-many mapping of frames to sky cells
  - candidates: detected moving object candidates
  - skybot_cache: cached SkyBoT cross-match results
"""

import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import json

from .config import DATABASE_PATH, GRID_W, GRID_H


def get_db_path() -> str:
    return str(Path(DATABASE_PATH).absolute())


def init_db(db_path: Optional[str] = None):
    """Initialize the database schema."""
    if db_path is None:
        db_path = get_db_path()
    
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Frames table - stores metadata about each SPHEREx frame
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frames (
            frame_id TEXT PRIMARY KEY,
            obs_id TEXT NOT NULL,
            planning_period TEXT NOT NULL,
            detector INTEGER NOT NULL,
            band INTEGER NOT NULL,
            survey TEXT NOT NULL,  -- 'Wide' or 'Deep'
            mjd_obs REAL NOT NULL,
            ra_center REAL NOT NULL,
            dec_center REAL NOT NULL,
            ra_min REAL NOT NULL,
            ra_max REAL NOT NULL,
            dec_min REAL NOT NULL,
            dec_max REAL NOT NULL,
            footprint TEXT NOT NULL,  -- JSON array of 4 corner (ra,dec) pairs
            s3_key TEXT,
            access_url TEXT,
            processing_version TEXT,
            ingested_at TEXT NOT NULL
        )
    """)
    
    # Index for fast spatial queries
    cur.execute("CREATE INDEX IF NOT EXISTS idx_frames_spatial ON frames(ra_min, ra_max, dec_min, dec_max)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_frames_planning ON frames(planning_period)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_frames_band ON frames(band)")
    
    # Frame-to-cell mapping
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frame_cell_map (
            frame_id TEXT NOT NULL,
            cell_i INTEGER NOT NULL,
            cell_j INTEGER NOT NULL,
            PRIMARY KEY (frame_id, cell_i, cell_j),
            FOREIGN KEY (frame_id) REFERENCES frames(frame_id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cell_map_ij ON frame_cell_map(cell_i, cell_j)")
    
    # Candidates table - detected moving objects
    cur.execute("""
        CREATE TABLE IF NOT EXISTS candidates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            ra REAL NOT NULL,
            dec REAL NOT NULL,
            band INTEGER NOT NULL,
            epoch_a TEXT NOT NULL,
            epoch_b TEXT NOT NULL,
            mjd_a REAL NOT NULL,
            mjd_b REAL NOT NULL,
            significance_sigma REAL NOT NULL,
            motion_arcsec REAL NOT NULL,
            motion_pa_deg REAL NOT NULL,
            motion_arcsec_per_day REAL,
            skybot_match TEXT,  -- JSON object with name, separation, epoch
            status TEXT DEFAULT 'pending',  -- pending, verified, artifact
            score_components TEXT,  -- JSON object with score breakdown
            thumb_urls TEXT,  -- JSON array of thumbnail URLs
            created_at TEXT NOT NULL,
            cell_i INTEGER,
            cell_j INTEGER
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_band ON candidates(band)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_created ON candidates(created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_cell ON candidates(cell_i, cell_j)")
    
    # SkyBoT cache
    cur.execute("""
        CREATE TABLE IF NOT EXISTS skybot_cache (
            ra REAL NOT NULL,
            dec REAL NOT NULL,
            mjd REAL NOT NULL,
            radius_arcsec REAL NOT NULL,
            result TEXT NOT NULL,  -- JSON array of matches
            queried_at TEXT NOT NULL,
            PRIMARY KEY (ra, dec, mjd, radius_arcsec)
        )
    """)
    
    # Status tracking
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ingest_status (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    
    conn.commit()
    conn.close()
    return db_path


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get a database connection."""
    if db_path is None:
        db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def upsert_frame(cur: sqlite3.Cursor, frame: Dict[str, Any]):
    """Insert or update a frame record."""
    cur.execute("""
        INSERT INTO frames (
            frame_id, obs_id, planning_period, detector, band, survey,
            mjd_obs, ra_center, dec_center, ra_min, ra_max, dec_min, dec_max,
            footprint, s3_key, access_url, processing_version, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(frame_id) DO UPDATE SET
            obs_id = excluded.obs_id,
            planning_period = excluded.planning_period,
            detector = excluded.detector,
            band = excluded.band,
            survey = excluded.survey,
            mjd_obs = excluded.mjd_obs,
            ra_center = excluded.ra_center,
            dec_center = excluded.dec_center,
            ra_min = excluded.ra_min,
            ra_max = excluded.ra_max,
            dec_min = excluded.dec_min,
            dec_max = excluded.dec_max,
            footprint = excluded.footprint,
            s3_key = excluded.s3_key,
            access_url = excluded.access_url,
            processing_version = excluded.processing_version,
            ingested_at = excluded.ingested_at
    """, (
        frame["frame_id"], frame["obs_id"], frame["planning_period"],
        frame["detector"], frame["band"], frame["survey"],
        frame["mjd_obs"], frame["ra_center"], frame["dec_center"],
        frame["ra_min"], frame["ra_max"], frame["dec_min"], frame["dec_max"],
        frame["footprint"], frame.get("s3_key"), frame.get("access_url"),
        frame.get("processing_version"), frame["ingested_at"]
    ))


def insert_frame_cells(cur: sqlite3.Cursor, frame_id: str, cells: List[tuple]):
    """Insert frame-to-cell mappings."""
    cur.executemany("""
        INSERT OR IGNORE INTO frame_cell_map (frame_id, cell_i, cell_j)
        VALUES (?, ?, ?)
    """, [(frame_id, i, j) for (i, j) in cells])


def insert_candidate(cur: sqlite3.Cursor, candidate: Dict[str, Any]):
    """Insert a candidate record."""
    cur.execute("""
        INSERT INTO candidates (
            id, name, ra, dec, band, epoch_a, epoch_b, mjd_a, mjd_b,
            significance_sigma, motion_arcsec, motion_pa_deg, motion_arcsec_per_day,
            skybot_match, status, score_components, thumb_urls, created_at, cell_i, cell_j
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        candidate["id"], candidate["name"], candidate["ra"], candidate["dec"],
        candidate["band"], candidate["epoch_a"], candidate["epoch_b"],
        candidate["mjd_a"], candidate["mjd_b"], candidate["significance_sigma"],
        candidate["motion_arcsec"], candidate["motion_pa_deg"],
        candidate.get("motion_arcsec_per_day"), json.dumps(candidate.get("skybot_match")),
        candidate.get("status", "pending"),
        json.dumps(candidate.get("score_components", {})),
        json.dumps(candidate.get("thumb_urls", [])),
        candidate["created_at"], candidate.get("cell_i"), candidate.get("cell_j")
    ))


def update_status(cur: sqlite3.Cursor, key: str, value: Any):
    """Update a status key-value pair."""
    now = datetime.now(timezone.utc).isoformat()
    cur.execute("""
        INSERT INTO ingest_status (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, (key, json.dumps(value) if not isinstance(value, str) else value, now))


def get_status(cur: sqlite3.Cursor, key: str) -> Optional[Any]:
    """Get a status value by key."""
    cur.execute("SELECT value FROM ingest_status WHERE key = ?", (key,))
    row = cur.fetchone()
    if row:
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return row["value"]
    return None


def get_frames_for_cell(cur: sqlite3.Cursor, cell_i: int, cell_j: int) -> List[sqlite3.Row]:
    """Get all frames covering a specific sky cell."""
    cur.execute("""
        SELECT f.* FROM frames f
        JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
        WHERE fcm.cell_i = ? AND fcm.cell_j = ?
        ORDER BY f.planning_period, f.band
    """, (cell_i, cell_j))
    return cur.fetchall()


def get_coverage_counts(cur: sqlite3.Cursor) -> tuple:
    """
    Get epoch counts per cell.
    Returns (counts_grid, indexed_grid) where each is GRID_H x GRID_W.
    An epoch = distinct planning_period with at least one frame.
    """
    # Count distinct planning periods per cell
    cur.execute("""
        SELECT fcm.cell_i, fcm.cell_j, COUNT(DISTINCT f.planning_period) as epoch_count
        FROM frame_cell_map fcm
        JOIN frames f ON f.frame_id = fcm.frame_id
        GROUP BY fcm.cell_i, fcm.cell_j
    """)
    
    counts = [[0] * GRID_W for _ in range(GRID_H)]
    indexed = [[0] * GRID_W for _ in range(GRID_H)]
    
    for row in cur.fetchall():
        i, j, count = row["cell_i"], row["cell_j"], row["epoch_count"]
        if 0 <= i < GRID_W and 0 <= j < GRID_H:
            counts[j][i] = min(count, 5)  # cap at 5+ for display
            indexed[j][i] = 1
    
    return counts, indexed


def get_candidates(cur: sqlite3.Cursor, 
                   since: Optional[str] = None,
                   band: Optional[int] = None,
                   status: Optional[str] = None,
                   limit: int = 100) -> List[sqlite3.Row]:
    """Query candidates with filters."""
    query = "SELECT * FROM candidates WHERE 1=1"
    params = []
    
    if since:
        query += " AND created_at >= ?"
        params.append(since)
    if band:
        query += " AND band = ?"
        params.append(band)
    if status:
        query += " AND status = ?"
        params.append(status)
    
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    cur.execute(query, params)
    return cur.fetchall()


def get_candidate_by_id(cur: sqlite3.Cursor, candidate_id: str) -> Optional[sqlite3.Row]:
    """Get a single candidate by ID."""
    cur.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,))
    return cur.fetchone()


def cache_skybot_result(cur: sqlite3.Cursor, ra: float, dec: float, 
                        mjd: float, radius: float, result: List[Dict]):
    """Cache a SkyBoT query result."""
    now = datetime.now(timezone.utc).isoformat()
    cur.execute("""
        INSERT INTO skybot_cache (ra, dec, mjd, radius_arcsec, result, queried_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ra, dec, mjd, radius_arcsec) DO UPDATE SET
            result = excluded.result, queried_at = excluded.queryed_at
    """, (ra, dec, mjd, radius, json.dumps(result), now))


def get_cached_skybot(cur: sqlite3.Cursor, ra: float, dec: float,
                      mjd: float, radius: float) -> Optional[List[Dict]]:
    """Get cached SkyBoT result if available."""
    cur.execute("""
        SELECT result FROM skybot_cache
        WHERE ra = ? AND dec = ? AND mjd = ? AND radius_arcsec = ?
    """, (ra, dec, mjd, radius))
    row = cur.fetchone()
    if row:
        return json.loads(row["result"])
    return None
