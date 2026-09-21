"""
SpectraHunt Database Schema and Helpers

SQLite database for storing SPHEREx frames, candidates, and cross-matches.
Works in both live (FastAPI) and static bundle modes.
"""

import sqlite3
from pathlib import Path

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
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
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


if __name__ == '__main__':
    import sys
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'spectrahunt.db'
    init_db(db_path)
    print(f"Database initialized: {db_path}")
