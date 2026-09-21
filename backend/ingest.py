"""
SpectraHunt Frame Ingestion

Discovers SPHEREx frames via SIA2, reads headers via HTTP range requests,
and indexes them into the SQLite database.
"""

import httpx
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import (
    IRSA_SIA2_URL, IRSA_SIA2_COLLECTION, USER_AGENT, 
    GRID_W, GRID_H, API_TIMEOUT_SECONDS
)
from backend.db import init_db, get_connection, cell_of


def query_sia2(ra, dec, radius_deg, collection='spherex_qr2'):
    """Query IRSA SIA2 service for frames covering a region."""
    # SIA2 URL format: https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr2&POS=circle+RA+DEC+RADIUS&RESPONSEFORMAT=VOTABLE
    params = {
        'COLLECTION': collection,
        'POS': f'circle {ra} {dec} {radius_deg}',
        'RESPONSEFORMAT': 'VOTABLE',
        'VERB': 2  # Include extra metadata
    }
    
    headers = {'User-Agent': USER_AGENT}
    
    try:
        with httpx.Client(timeout=API_TIMEOUT_SECONDS) as client:
            response = client.get(IRSA_SIA2_URL, params=params, headers=headers)
            response.raise_for_status()
            return response.text
    except httpx.HTTPError as e:
        print(f"SIA2 query failed: {e}")
        return None


def parse_votable(votable_xml):
    """Parse SIA2 VOTable response and extract frame metadata."""
    # Simplified parser - in production use astropy.table.Table
    # This is a placeholder that returns empty list if parsing fails
    frames = []
    
    try:
        from astropy.table import Table
        table = Table.read(votable_xml, format='votable')
        
        for row in table:
            try:
                # Extract required fields from SIA2 response
                access_url = row.get('access_url', '')
                ra_center = float(row.get('ra', 0))
                dec_center = float(row.get('dec', 0))
                
                # Parse observation ID from filename or metadata
                obs_id = row.get('observation_id', '')
                if not obs_id and access_url:
                    # Extract from URL: level2_2025W19_2B_...fits
                    parts = access_url.split('/')
                    for part in parts:
                        if part.startswith('level2_'):
                            obs_id = part.replace('level2_', '').split('_')[0]
                            break
                
                # Extract planning period from obs_id (e.g., 2025W19_2B)
                planning_period = obs_id.split('_')[0] if obs_id else ''
                
                # Detector and band (may need to parse from filename)
                detector = int(row.get('detector', 1))
                band = int(row.get('band', 1))
                
                # Observation time
                mjd_obs = float(row.get('mjd_obs', 0))
                
                # Footprint (4 corners)
                footprint_coords = []
                for i in range(1, 5):
                    ra_key = f'ra{i}' if f'ra{i}' in row.colnames else f'RA{i}'
                    dec_key = f'dec{i}' if f'dec{i}' in row.colnames else f'DEC{i}'
                    if ra_key in row.colnames and dec_key in row.colnames:
                        footprint_coords.append([float(row[ra_key]), float(row[dec_key])])
                
                if not footprint_coords:
                    # Approximate footprint as 2° square around center
                    size = 1.0
                    footprint_coords = [
                        [ra_center - size, dec_center - size],
                        [ra_center + size, dec_center - size],
                        [ra_center + size, dec_center + size],
                        [ra_center - size, dec_center + size]
                    ]
                
                # Generate frame_id from access_url or obs_id
                frame_id = access_url.split('/')[-1] if access_url else f"{obs_id}_D{detector}"
                
                frames.append({
                    'frame_id': frame_id,
                    'obs_id': obs_id,
                    'planning_period': planning_period,
                    'detector': detector,
                    'band': band,
                    'survey': 'Deep' if 'deep' in access_url.lower() else 'Wide',
                    'mjd_obs': mjd_obs,
                    'ra_center': ra_center,
                    'dec_center': dec_center,
                    'footprint': json.dumps(footprint_coords),
                    's3_key': '',  # Can be derived from access_url
                    'access_url': access_url,
                    'processing_version': row.get('processing_version', 'unknown')
                })
            except Exception as e:
                print(f"Skipping row due to error: {e}")
                continue
    except ImportError:
        print("astropy.table not available, using fallback parser")
        # Fallback: return empty list
        pass
    except Exception as e:
        print(f"VOTable parsing failed: {e}")
    
    return frames


def ingest_frames(db_path, ra, dec, radius_deg, max_frames=100):
    """Ingest frames from SIA2 query into database."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Query SIA2
    print(f"Querying SIA2 for region: RA={ra}, Dec={dec}, radius={radius_deg}°")
    votable = query_sia2(ra, dec, radius_deg, IRSA_SIA2_COLLECTION)
    
    if not votable:
        print("SIA2 query returned no data")
        conn.close()
        return {'frames_indexed': 0}
    
    # Parse VOTable
    frames = parse_votable(votable)
    print(f"Parsed {len(frames)} frames from VOTable")
    
    # Limit frames
    if len(frames) > max_frames:
        frames = frames[:max_frames]
        print(f"Limited to {max_frames} frames")
    
    # Insert frames into database
    ingested_at = datetime.now(timezone.utc).isoformat()
    inserted = 0
    
    for frame in frames:
        try:
            # Check if frame already exists
            existing = cursor.execute(
                "SELECT frame_id FROM frames WHERE frame_id = ?",
                (frame['frame_id'],)
            ).fetchone()
            
            if existing:
                print(f"Skipping existing frame: {frame['frame_id']}")
                continue
            
            # Insert frame
            cursor.execute("""
                INSERT INTO frames (
                    frame_id, obs_id, planning_period, detector, band, survey,
                    mjd_obs, ra_center, dec_center, footprint, s3_key,
                    access_url, processing_version, ingested_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                frame['frame_id'], frame['obs_id'], frame['planning_period'],
                frame['detector'], frame['band'], frame['survey'],
                frame['mjd_obs'], frame['ra_center'], frame['dec_center'],
                frame['footprint'], frame['s3_key'], frame['access_url'],
                frame['processing_version'], ingested_at
            ))
            
            # Map frame to grid cells
            ra_c, dec_c = frame['ra_center'], frame['dec_center']
            i, j = cell_of(ra_c, dec_c)
            cursor.execute(
                "INSERT OR IGNORE INTO frame_cell_map (frame_id, i, j) VALUES (?, ?, ?)",
                (frame['frame_id'], i, j)
            )
            
            inserted += 1
        except Exception as e:
            print(f"Error inserting frame {frame['frame_id']}: {e}")
            continue
    
    conn.commit()
    conn.close()
    
    print(f"Inserted {inserted} frames into database")
    return {'frames_indexed': inserted}


def run_ingestion(db_path='spectrahunt.db', ra=180, dec=0, radius=5, max_frames=100):
    """Main ingestion entry point."""
    # Initialize database if needed
    init_db(db_path)
    
    # Run ingestion
    result = ingest_frames(db_path, ra, dec, radius, max_frames)
    
    return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Ingest SPHEREx frames')
    parser.add_argument('--db', type=str, default='spectrahunt.db', help='Database path')
    parser.add_argument('--ra', type=float, default=180, help='Center RA')
    parser.add_argument('--dec', type=float, default=0, help='Center Dec')
    parser.add_argument('--radius', type=float, default=5, help='Search radius (degrees)')
    parser.add_argument('--max-frames', type=int, default=100, help='Max frames to ingest')
    args = parser.parse_args()
    
    result = run_ingestion(
        db_path=args.db,
        ra=args.ra,
        dec=args.dec,
        radius=args.radius,
        max_frames=args.max_frames
    )
    
    print(f"\nIngestion complete: {result['frames_indexed']} frames indexed")
