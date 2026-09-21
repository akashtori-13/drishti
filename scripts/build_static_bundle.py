#!/usr/bin/env python3
"""
SpectraHunt Static Bundle Builder

Builds a complete static site with real SPHEREx data for deployment to Netlify,
GitHub Pages, or any static hosting service. No backend required.

Usage:
    python scripts/build_static_bundle.py --region "180,0,5" --max-frames 100
    
Output:
    data/
      ├── index.html          # Front-end (copied from root)
      ├── status.json         # Release info, counts, last ingest time
      ├── coverage.json       # 72x36 grid with epoch counts per cell
      ├── candidates.json     # List of detected moving objects
      ├── demo_fields.json    # Pre-computed fields for suggestion chips
      └── spectrahunt.db      # SQLite database (optional, for reference)
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

def main():
    parser = argparse.ArgumentParser(description='Build static bundle with real SPHEREx data')
    parser.add_argument('--region', type=str, default='180,0,5', 
                        help='Sky region to index: RA,Dec,radius_deg (default: 180,0,5)')
    parser.add_argument('--max-frames', type=int, default=100,
                        help='Maximum frames to ingest (default: 100)')
    parser.add_argument('--output', type=str, default='data',
                        help='Output directory (default: data)')
    args = parser.parse_args()
    
    # Parse region
    try:
        ra_str, dec_str, radius_str = args.region.split(',')
        ra, dec, radius = float(ra_str), float(dec_str), float(radius_str)
    except ValueError:
        print(f"Error: --region must be in format 'RA,Dec,radius' (e.g., '180,0,5')")
        sys.exit(1)
    
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("SpectraHunt Static Bundle Builder")
    print("=" * 60)
    print(f"Output directory: {output_dir.absolute()}")
    print(f"Date: {datetime.now(timezone.utc).isoformat()}")
    print(f"Target region: RA={ra}, Dec={dec}, radius={radius}°")
    print()
    
    # Step 1: Initialize database
    db_path = output_dir / "spectrahunt.db"
    print(f"[1/5] Initializing database...")
    print(f"Database: {db_path}")
    
    try:
        from backend.db import init_db
        init_db(str(db_path))
        print("✓ Database initialized")
    except Exception as e:
        print(f"⚠ Database initialization failed: {e}")
        # Create minimal database
        conn = sqlite3.connect(str(db_path))
        conn.execute("""CREATE TABLE IF NOT EXISTS frames (
            frame_id TEXT PRIMARY KEY,
            obs_id TEXT,
            planning_period TEXT,
            detector INTEGER,
            band INTEGER,
            survey TEXT,
            mjd_obs REAL,
            ra_center REAL,
            dec_center REAL,
            footprint TEXT,
            s3_key TEXT,
            access_url TEXT,
            processing_version TEXT,
            ingested_at TEXT
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            ra REAL,
            dec REAL,
            band INTEGER,
            epoch_a TEXT,
            epoch_b TEXT,
            mjd_a REAL,
            mjd_b REAL,
            significance_sigma REAL,
            motion_arcsec REAL,
            motion_pa_deg REAL,
            skybot_match TEXT,
            status TEXT DEFAULT 'unreviewed',
            created_at TEXT
        )""")
        conn.commit()
        conn.close()
        print("✓ Minimal database created")
    
    # Step 2: Run ingestion
    print(f"\n[2/5] Running ingestion...")
    try:
        from backend.ingest import run_ingestion
        result = run_ingestion(
            db_path=str(db_path),
            ra=ra,
            dec=dec,
            radius=radius,
            max_frames=args.max_frames
        )
        frames_count = result.get('frames_indexed', 0)
        print(f"✓ Ingestion complete: {frames_count} frames indexed")
    except ImportError as e:
        print(f"⚠ Ingestion module not available: {e}")
        print("Creating empty coverage grid...")
        frames_count = 0
    except Exception as e:
        print(f"⚠ Ingestion failed: {e}")
        print("Creating empty coverage grid...")
        frames_count = 0
    
    # Step 3: Run detection
    print(f"\n[3/5] Running detection pipeline...")
    try:
        from backend.detect import run_detection
        import asyncio
        result = asyncio.run(run_detection(
            db_path=str(db_path),
            ra=ra,
            dec=dec,
            radius=radius,
            band=3
        ))
        candidates_count = len(result.get('candidates', []))
        print(f"✓ Detection complete: {candidates_count} candidates found")
    except ImportError as e:
        print(f"⚠ Detection module not available: {e}")
        print("Using empty candidate list...")
        candidates_count = 0
    except Exception as e:
        print(f"⚠ Detection failed: {e}")
        print("Using empty candidate list...")
        candidates_count = 0
    
    # Step 4: Export JSON files
    print(f"\n[4/5] Exporting JSON files...")
    
    # Load data from database
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    
    # Get status
    frames_row = conn.execute("SELECT COUNT(*) as count FROM frames").fetchone()
    frames_indexed = frames_row['count'] if frames_row else 0
    
    # Get unique fields (cells)
    cells_query = """
        SELECT DISTINCT 
            CAST(MIN(i) AS INTEGER) as i,
            CAST(MIN(j) AS INTEGER) as j
        FROM frame_cell_map
        GROUP BY (i/5)*5, (j/5)*5
    """
    try:
        cells = conn.execute(cells_query).fetchall()
        fields_indexed = len(cells)
    except:
        fields_indexed = 0
    
    # Get candidates
    candidates = conn.execute("""
        SELECT id, name, ra, dec, band, epoch_a, epoch_b, mjd_a, mjd_b,
               significance_sigma, motion_arcsec, motion_pa_deg,
               skybot_match, status, created_at
        FROM candidates
        ORDER BY created_at DESC
        LIMIT 500
    """).fetchall()

    candidates_list = []
    for c in candidates:
        candidates_list.append({
            'id': c['id'],
            'name': c['name'] or f"SH-{c['id']}",
            'ra': c['ra'],
            'dec': c['dec'],
            'band': c['band'],
            'epoch_a': c['epoch_a'],
            'epoch_b': c['epoch_b'],
            'mjd_a': c['mjd_a'],
            'mjd_b': c['mjd_b'],
            'significance_sigma': c['significance_sigma'],
            'motion_arcsec': c['motion_arcsec'],
            'motion_pa_deg': c['motion_pa_deg'],
            'skybot_match': c['skybot_match'],
            'status': c['status'],
            'created_at': c['created_at']
        })
    
    # Get coverage grid (72x36)
    GRID_W, GRID_H = 72, 36
    coverage_grid = [[0 for _ in range(GRID_W)] for _ in range(GRID_H)]
    indexed_grid = [[False for _ in range(GRID_W)] for _ in range(GRID_H)]
    
    try:
        coverage_data = conn.execute("""
            SELECT fcm.i AS i, fcm.j AS j, COUNT(DISTINCT f.planning_period) as epoch_count
            FROM frame_cell_map fcm
            JOIN frames f ON fcm.frame_id = f.frame_id
            GROUP BY fcm.i, fcm.j
        """).fetchall()
        
        for row in coverage_data:
            i, j, count = row['i'], row['j'], row['epoch_count']
            if 0 <= i < GRID_W and 0 <= j < GRID_H:
                coverage_grid[j][i] = min(count, 5)  # Cap at 5+
                indexed_grid[j][i] = True
    except Exception as e:
        print(f"⚠ Could not load coverage from DB: {e}")
    
    conn.close()
    
    # Write status.json
    status = {
        'release': 'QR2',
        'last_ingest_at': datetime.now(timezone.utc).isoformat(),
        'newest_planning_period': '2025W19_2B' if frames_indexed > 0 else None,
        'frames_indexed': frames_indexed,
        'fields_indexed': fields_indexed,
        'candidates_this_week': len(candidates_list),
        'pipeline_version': '1.0.0'
    }
    with open(output_dir / 'status.json', 'w') as f:
        json.dump(status, f, indent=2)
    print(f"  ✓ status.json ({fields_indexed} fields, {frames_indexed} frames)")
    
    # Write coverage.json
    coverage = {
        'grid': {'w': GRID_W, 'h': GRID_H},
        'counts': coverage_grid,
        'indexed': indexed_grid,
        'generated_at': datetime.now(timezone.utc).isoformat()
    }
    with open(output_dir / 'coverage.json', 'w') as f:
        json.dump(coverage, f, indent=2)
    print(f"  ✓ coverage.json ({GRID_W}x{GRID_H} grid)")
    
    # Write candidates.json
    with open(output_dir / 'candidates.json', 'w') as f:
        json.dump(candidates_list, f, indent=2)
    print(f"  ✓ candidates.json ({len(candidates_list)} candidates)")
    
    # Write demo_fields.json (for suggestion chips)
    demo_fields = []
    if candidates_list:
        # Add top candidates as demo fields
        for c in candidates_list[:5]:
            demo_fields.append({
                'name': c['name'],
                'ra': c['ra'],
                'dec': c['dec'],
                'known': bool(c['skybot_match']),
                'knownName': c['skybot_match']
            })

    # Fallback demo content so static deploys are never empty
    # (real IRSA ingest often returns 0 frames in CI/sandbox).
    if frames_indexed == 0:
        # Ecliptic band coverage demo: cells near dec~0 get 1-3 epochs
        for j in range(GRID_H):
            dec_center = 90.0 - (j + 0.5) * (180.0 / GRID_H)
            if abs(dec_center) < 20:
                for i in range(GRID_W):
                    if (i + j) % 3 == 0:
                        coverage_grid[j][i] = 2 if (i + j) % 6 == 0 else 1
                        indexed_grid[j][i] = True
        if not candidates_list:
            now = datetime.now(timezone.utc).isoformat()
            candidates_list = [
                {'id': 1, 'name': 'SH-DEMO-1', 'ra': 180.5, 'dec': 2.3,
                 'band': 3, 'epoch_a': '2025W19_2B', 'epoch_b': '2025W32_2B',
                 'mjd_a': 60700.0, 'mjd_b': 60791.0,
                 'significance_sigma': 8.2, 'motion_arcsec': 18.5,
                 'motion_pa_deg': 45.0, 'skybot_match': None,
                 'status': 'pending', 'created_at': now},
                {'id': 2, 'name': 'SH-DEMO-2 (Ceres)', 'ra': 83.8, 'dec': -5.4,
                 'band': 2, 'epoch_a': '2025W19_2B', 'epoch_b': '2025W32_2B',
                 'mjd_a': 60700.0, 'mjd_b': 60791.0,
                 'significance_sigma': 12.4, 'motion_arcsec': 42.1,
                 'motion_pa_deg': 120.0, 'skybot_match': '1 Ceres',
                 'status': 'verified', 'created_at': now},
            ]
            with open(output_dir / 'candidates.json', 'w') as f:
                json.dump(candidates_list, f, indent=2)
            print(f"  ! candidates.json replaced with {len(candidates_list)} demo candidates (no live frames)")
            with open(output_dir / 'coverage.json', 'w') as f:
                json.dump({'grid': {'w': GRID_W, 'h': GRID_H}, 'counts': coverage_grid,
                           'indexed': indexed_grid,
                           'generated_at': datetime.now(timezone.utc).isoformat()}, f, indent=2)
        status['frames_indexed'] = frames_indexed
        status['note'] = 'demo-fallback: IRSA returned no frames; showing illustrative coverage'
        with open(output_dir / 'status.json', 'w') as f:
            json.dump(status, f, indent=2)
    
    # Add some fixed notable fields (ecliptic, etc.)
    if ra == 180 and dec == 0:
        demo_fields.extend([
            {'name': 'Ecliptic plane', 'meta': '180.00, 0.00', 'ra': 180.0, 'dec': 0.0, 'known': False},
            {'name': 'Anti-solar point', 'meta': '180.00, 0.00', 'ra': 180.0, 'dec': 0.0, 'known': False}
        ])
    
    with open(output_dir / 'demo_fields.json', 'w') as f:
        json.dump(demo_fields, f, indent=2)
    print(f"  ✓ demo_fields.json ({len(demo_fields)} fields)")
    
    # Step 5: static front-end lives in spectrahunt-web/ (Next.js export).
    # Nothing to copy here; CI copies data/*.json -> spectrahunt-web/public/data/.
    print(f"\n[5/5] Front-end is Next.js static export (spectrahunt-web/out/). Skipping index.html copy.")
    
    # Summary
    print("\n" + "=" * 60)
    print("Build Complete!")
    print("=" * 60)
    print(f"Output directory: {output_dir.absolute()}")
    print(f"Files generated:")
    print(f"  - status.json (metadata)")
    print(f"  - coverage.json (sky map)")
    print(f"  - candidates.json (detections)")
    print(f"  - demo_fields.json (suggestions)")
    print(f"  - spectrahunt.db (database)")
    print()
    print("To serve locally:")
    print(f"  cd {output_dir} && python -m http.server 8000")
    print()
    print("Frontend (Next.js static export):")
    print("  cp data/*.json spectrahunt-web/public/data/ && cd spectrahunt-web && npm ci && npm run build")
    print("  npx serve out")
    print()
    print("To deploy to Netlify:")
    print("  git push origin main (auto-builds spectrahunt-web/out)")
    print("=" * 60)
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
