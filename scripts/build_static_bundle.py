#!/usr/bin/env python3
"""
Build static bundle for SpectraHunt.

Generates data/*.json and data/img/*.png for static hosting (GitHub Pages, Netlify).
This is the hackathon-safe mode - no backend server needed.

Run with: python scripts/build_static_bundle.py --region RA,DEC,RADIUS
"""

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import (
    RELEASE, RELEASE_DOI, PIPELINE_VERSION, CITATION_TEXT,
    GRID_W, GRID_H, DATABASE_PATH, PNG_CACHE_DIR
)
from backend.db import init_db, get_connection, get_coverage_counts, get_candidates, get_status, update_status
from backend.ingest import run_ingest
from backend.detect import run_detection


async def build_bundle(
    output_dir: str = "data",
    region: str = None,
    max_frames: int = 100
):
    """
    Build static bundle with real SPHEREx data.
    
    Steps:
    1. Initialize database
    2. Run ingestion for specified region(s)
    3. Run detection pipeline
    4. Export JSON files for front-end consumption
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("SpectraHunt Static Bundle Builder")
    print("=" * 60)
    print(f"Output directory: {output_path}")
    print(f"Date: {datetime.now(timezone.utc).isoformat()}")
    
    # Parse region if provided
    ingest_region = None
    if region:
        parts = region.split(',')
        if len(parts) >= 3:
            ingest_region = (float(parts[0]), float(parts[1]), float(parts[2]))
            print(f"Target region: RA={parts[0]}, Dec={parts[1]}, radius={parts[2]}°")
    
    # Step 1: Initialize database
    print("\n[1/4] Initializing database...")
    db_path = init_db()
    print(f"Database: {db_path}")
    
    # Step 2: Run ingestion
    print("\n[2/4] Running ingestion...")
    frames_count = await run_ingest(
        region=ingest_region,
        max_frames=max_frames,
        db_path=db_path
    )
    
    if frames_count == 0:
        print("⚠ No frames ingested. Creating minimal bundle with empty state.")
    
    # Step 3: Run detection
    print("\n[3/4] Running detection pipeline...")
    candidates_count = await run_detection(db_path=db_path)
    
    # Step 4: Export JSON files
    print("\n[4/4] Exporting JSON files...")
    
    conn = get_connection(db_path)
    cur = conn.cursor()
    
    # Export status.json
    last_ingest = get_status(cur, "last_ingest_at")
    newest_pp = get_status(cur, "newest_planning_period")
    fields_count = cur.execute("SELECT COUNT(DISTINCT cell_i * 1000 + cell_j) FROM frame_cell_map").fetchone()[0] or 0
    
    week_ago = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=7)).isoformat()
    candidates_week = cur.execute("SELECT COUNT(*) FROM candidates WHERE created_at >= ?", (week_ago,)).fetchone()[0] or 0
    
    status_data = {
        "release": RELEASE,
        "last_ingest_at": last_ingest,
        "newest_planning_period": newest_pp,
        "frames_indexed": frames_count,
        "fields_indexed": fields_count,
        "candidates_this_week": candidates_week,
        "pipeline_version": PIPELINE_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    
    with open(output_path / "status.json", "w") as f:
        json.dump(status_data, f, indent=2)
    print(f"  ✓ status.json ({fields_count} fields, {frames_count} frames)")
    
    # Export coverage.json
    counts, indexed = get_coverage_counts(cur)
    
    coverage_data = {
        "grid": {"w": GRID_W, "h": GRID_H},
        "counts": counts,
        "indexed": indexed,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    
    with open(output_path / "coverage.json", "w") as f:
        json.dump(coverage_data, f, indent=2)
    print(f"  ✓ coverage.json ({GRID_W}x{GRID_H} grid)")
    
    # Export candidates.json
    rows = get_candidates(cur, limit=500)
    candidates_list = []
    for row in rows:
        candidates_list.append({
            "id": row["id"],
            "name": row["name"],
            "ra": row["ra"],
            "dec": row["dec"],
            "band": row["band"],
            "epoch_a": row["epoch_a"],
            "epoch_b": row["epoch_b"],
            "significance_sigma": row["significance_sigma"],
            "motion_arcsec": row["motion_arcsec"],
            "motion_pa_deg": row["motion_pa_deg"],
            "skybot_match": json.loads(row["skybot_match"]) if row["skybot_match"] else None,
            "status": row["status"],
            "thumb_urls": json.loads(row["thumb_urls"]) if row["thumb_urls"] else [],
            "created_at": row["created_at"]
        })
    
    with open(output_path / "candidates.json", "w") as f:
        json.dump(candidates_list, f, indent=2)
    print(f"  ✓ candidates.json ({len(candidates_list)} candidates)")
    
    # Export sample fields for demo chips
    # Pick cells with good coverage
    demo_fields = []
    cur.execute("""
        SELECT fcm.cell_i, fcm.cell_j, COUNT(DISTINCT f.planning_period) as epochs
        FROM frame_cell_map fcm
        JOIN frames f ON f.frame_id = fcm.frame_id
        GROUP BY fcm.cell_i, fcm.cell_j
        HAVING epochs >= 2
        ORDER BY epochs DESC
        LIMIT 5
    """)
    
    for row in cur.fetchall():
        i, j, epochs = row
        ra_center = (i + 0.5) / GRID_W * 360
        dec_center = 90 - (j + 0.5) / GRID_H * 180
        
        demo_fields.append({
            "cell_i": i,
            "cell_j": j,
            "ra": ra_center,
            "dec": dec_center,
            "epochs": epochs,
            "label": f"Field {i:02d}-{j:02d}"
        })
    
    with open(output_path / "demo_fields.json", "w") as f:
        json.dump(demo_fields, f, indent=2)
    print(f"  ✓ demo_fields.json ({len(demo_fields)} fields)")
    
    conn.close()
    
    # Copy database to output for reference (only if different path)
    import shutil
    db_dest = output_path / "spectrahunt.db"
    db_src = Path(db_path).resolve()
    if db_src != db_dest.resolve():
        try:
            shutil.copy(db_path, db_dest)
            print(f"  ✓ spectrahunt.db (copy)")
        except Exception as e:
            print(f"  ⚠ Could not copy database: {e}")
    else:
        print(f"  ✓ spectrahunt.db (already in output dir)")
    
    print("\n" + "=" * 60)
    print("Bundle complete!")
    print("=" * 60)
    print(f"\nFiles generated in {output_path}/:")
    for f in sorted(output_path.glob("*")):
        size = f.stat().st_size
        print(f"  {f.name}: {size:,} bytes")
    
    # Copy index.html to output directory for static hosting
    index_src = Path(__file__).parent.parent / "index.html"
    index_dest = output_path / "index.html"
    if index_src.exists():
        import shutil
        try:
            shutil.copy(index_src, index_dest)
            print(f"  ✓ index.html (copied for static hosting)")
        except Exception as e:
            print(f"  ⚠ Could not copy index.html: {e}")
    else:
        print(f"  ⚠ index.html not found at {index_src}")
    
    print("\nTo host on GitHub Pages / Netlify:")
    print(f"  1. Set your publish directory to: {output_path.absolute()}")
    print("  2. Or copy all files from this directory to your web root")
    print("  3. The site will use static JSON data (no backend needed)")
    
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build static bundle for SpectraHunt")
    parser.add_argument("--output", type=str, default="data", help="Output directory")
    parser.add_argument("--region", type=str, help="Region as RA,Dec,radius_deg")
    parser.add_argument("--max-frames", type=int, default=50, help="Max frames to ingest")
    
    args = parser.parse_args()
    
    success = asyncio.run(build_bundle(
        output_dir=args.output,
        region=args.region,
        max_frames=args.max_frames
    ))
    
    sys.exit(0 if success else 1)
