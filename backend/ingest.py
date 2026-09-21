"""
Frame ingestion for SpectraHunt.

Discovers SPHEREx QR2 frames via SIA2 or AWS S3 listing,
reads headers only (via HTTP range requests), and indexes them.

Run as: python -m backend.ingest --ra 180 --dec 0 --radius 2
Or:     python scripts/build_static_bundle.py (which calls this correctly)
"""

import asyncio
import hashlib
import json
import re
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor
import httpx
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np

# Add parent directory to path so relative imports work when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import (
    IRSA_SIA2_ENDPOINT, SIA2_COLLECTION_WIDE, SIA2_COLLECTION_DEEP,
    AWS_BUCKET, AWS_REGION, AWS_PREFIX, IRSA_CUTOUT_BASE,
    MAX_CONCURRENT_IRSA_REQUESTS, INGEST_TIMEOUT_SECONDS, USER_AGENT,
    GRID_W, GRID_H, CELL_SIZE_DEG, FLAGS_BAD_BITS
)
from backend.db import init_db, get_connection, upsert_frame, insert_frame_cells, update_status


def cell_of(ra: float, dec: float) -> Tuple[int, int]:
    """Convert RA/Dec to grid cell coordinates."""
    i = min(GRID_W - 1, max(0, int(ra / 360 * GRID_W)))
    j = min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H)))
    return i, j


def footprint_overlaps_cells(footprint: List[Tuple[float, float]]) -> List[Tuple[int, int]]:
    """Determine which sky cells a footprint overlaps."""
    cells = set()
    ras = [p[0] for p in footprint]
    decs = [p[1] for p in footprint]
    
    # Handle RA wrap-around
    ra_min, ra_max = min(ras), max(ras)
    if ra_max - ra_min > 180:  # crosses 0/360
        ra_ranges = [(0, ra_max), (ra_min, 360)]
    else:
        ra_ranges = [(ra_min, ra_max)]
    
    dec_min, dec_max = min(decs), max(decs)
    
    for ra_start, ra_end in ra_ranges:
        for ra in np.linspace(ra_start, ra_end, 50):
            for dec in np.linspace(dec_min, dec_max, 25):
                cells.add(cell_of(ra, dec))
    
    return list(cells)


async def fetch_sia2_frames(
    ra_center: float, dec_center: float, radius_deg: float,
    collection: str = SIA2_COLLECTION_WIDE
) -> AsyncGenerator[Dict, None]:
    """
    Query SIA2 for frames covering a position.
    Yields frame metadata dicts.
    
    Note: SIA2 lags new ingests by about a day (per documentation).
    For fresh data, use AWS S3 listing instead.
    """
    query_params = {
        "COLLECTION": collection,
        "POS": f"circle {ra_center} {dec_center} {radius_deg}",
        "RESPONSEFORMAT": "VOTABLE",
        "VERB": 2  # include extra metadata
    }
    
    headers = {"User-Agent": USER_AGENT}
    
    async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
        try:
            response = await client.get(
                IRSA_SIA2_ENDPOINT,
                params=query_params,
                headers=headers
            )
            response.raise_for_status()
            
            # Parse VOTable (simplified - in production use astropy.table)
            # For now, we'll extract access URLs from the XML
            xml_content = response.text
            
            # Extract access_url values from VOTable
            access_urls = re.findall(r'<TD[^>]*>(https?://[^<]+\.fits[^<]*)</TD>', xml_content)
            
            for url in access_urls:
                # Parse filename for metadata
                # Pattern: level2_2025W18_2B_0001_1D1_spx_l2b-v12-2025-164.fits
                match = re.search(r'level2_(\d+W\d+_\w+)_(\d+)D(\d+)_spx_l2b-v(\d+)-(\d+-\d+)\.fits', url)
                if match:
                    obs_id, det_num, band, version, proc_date = match.groups()
                    
                    yield {
                        "access_url": url,
                        "obs_id": obs_id,
                        "detector": int(det_num),
                        "band": int(band),
                        "processing_version": version,
                        "proc_date": proc_date
                    }
        except httpx.HTTPError as e:
            print(f"SIA2 query failed: {e}")


async def read_fits_header_via_range(url: str) -> Optional[Dict[str, Any]]:
    """
    Read FITS header using HTTP range requests.
    Only downloads header portion, not full 70MB file.
    """
    headers = {"User-Agent": USER_AGENT, "Range": "bytes=0-10000000"}  # first 10MB should contain header
    
    async with httpx.AsyncClient(timeout=INGEST_TIMEOUT_SECONDS) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            # Parse FITS from bytes
            hdul = fits.open(Path("temp.fits").write_bytes(response.content))
            
            # Extract relevant header keywords from primary HDU and IMAGE extension
            header = hdul[0].header
            if 'IMAGE' in hdul:
                header.update(hdul['IMAGE'].header)
            
            # Get WCS from IMAGE extension
            wcs = WCS(hdul['IMAGE'].header)
            
            # Compute footprint corners
            shape = hdul['IMAGE'].data.shape if hdul['IMAGE'].data is not None else (2040, 2040)
            corners_pix = [
                (0, 0),
                (shape[1] - 1, 0),
                (shape[1] - 1, shape[0] - 1),
                (0, shape[0] - 1)
            ]
            corners_world = wcs.all_pix2world(corners_pix, 1)
            
            # Handle RA wrap-around in footprint
            footprint = []
            for ra, dec in corners_world:
                footprint.append((float(ra), float(dec)))
            
            # Compute bounding box
            ras = [p[0] for p in footprint]
            decs = [p[1] for p in footprint]
            
            # Normalize RA values
            ras_norm = []
            for ra in ras:
                while ra < 0: ra += 360
                while ra >= 360: ra -= 360
                ras_norm.append(ra)
            
            result = {
                "ra_center": float(header.get('CRVAL1', np.mean(ras_norm))),
                "dec_center": float(header.get('CRVAL2', np.mean(decs))),
                "ra_min": min(ras_norm),
                "ra_max": max(ras_norm),
                "dec_min": min(decs),
                "dec_max": max(decs),
                "footprint": footprint,
                "mjd_obs": float(header.get('MJD-OBS', header.get('MJD_OBS', 0))),
                "date_obs": header.get('DATE-OBS', ''),
                "detector": int(header.get('DET-ID', 1)),
                "band": int(header.get('BAND-ID', 1)),
                "pixel_scale": float(header.get('CDELT1', 6.2 / 3600))  # degrees per pixel
            }
            
            hdul.close()
            return result
            
        except Exception as e:
            print(f"Failed to read header from {url}: {e}")
            return None
        finally:
            # Clean up temp file
            try:
                Path("temp.fits").unlink(missing_ok=True)
            except:
                pass


def parse_obs_id(obs_id: str) -> Dict[str, str]:
    """Parse observation ID into components.
    
    Example: 2025W18_2B -> planning_period=2025W18, slew=2B
    """
    match = re.match(r'(\d+W\d+)_(\w+)', obs_id)
    if match:
        return {
            "planning_period": match.group(1),
            "slew": match.group(2)
        }
    return {"planning_period": obs_id, "slew": ""}


async def ingest_frame_metadata(
    access_url: str, 
    obs_id: str,
    detector: int,
    band: int,
    processing_version: str
) -> Optional[Dict[str, Any]]:
    """Ingest metadata for a single frame."""
    header_info = await read_fits_header_via_range(access_url)
    if not header_info:
        return None
    
    obs_parts = parse_obs_id(obs_id)
    planning_period = obs_parts["planning_period"]
    
    # Generate frame_id from URL hash
    frame_id = hashlib.md5(access_url.encode()).hexdigest()[:16]
    
    # Construct S3 key (mirrors on-prem layout)
    s3_key = f"{AWS_PREFIX}/{planning_period}/l2b-v{processing_version}/{detector}/level2_{obs_id}_{detector}D{band}_spx_l2b-v{processing_version}.fits"
    
    return {
        "frame_id": frame_id,
        "obs_id": obs_id,
        "planning_period": planning_period,
        "detector": detector,
        "band": band,
        "survey": "Wide",  # default; could be determined from collection
        "mjd_obs": header_info["mjd_obs"],
        "ra_center": header_info["ra_center"],
        "dec_center": header_info["dec_center"],
        "ra_min": header_info["ra_min"],
        "ra_max": header_info["ra_max"],
        "dec_min": header_info["dec_min"],
        "dec_max": header_info["dec_max"],
        "footprint": json.dumps(header_info["footprint"]),
        "s3_key": s3_key,
        "access_url": access_url,
        "processing_version": processing_version,
        "ingested_at": datetime.now(timezone.utc).isoformat()
    }


async def run_ingest(
    region: Optional[Tuple[float, float, float]] = None,  # (ra, dec, radius_deg)
    max_frames: Optional[int] = None,
    db_path: Optional[str] = None
):
    """
    Run the ingestion process.
    
    Args:
        region: If provided, only ingest frames covering this (ra, dec, radius_deg)
        max_frames: Maximum number of frames to ingest
        db_path: Database path (uses config default if None)
    """
    # Initialize database
    db_path = init_db(db_path)
    
    frames_ingested = 0
    newest_planning_period = None
    
    # Default: query a few representative fields if no region specified
    if region is None:
        # Sample positions along ecliptic and some known fields
        regions = [
            (156.09, -41.64, 2.0),  # Example field
            (0, 0, 2.0),  # Ecliptic
            (90, 0, 2.0),
            (180, 0, 2.0),
            (270, 0, 2.0),
        ]
    else:
        regions = [region]
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_IRSA_REQUESTS)
    
    async def process_region(ra, dec, radius):
        nonlocal frames_ingested, newest_planning_period
        
        async with semaphore:
            async for frame_meta in fetch_sia2_frames(ra, dec, radius):
                if max_frames and frames_ingested >= max_frames:
                    return
                
                full_meta = await ingest_frame_metadata(
                    frame_meta["access_url"],
                    frame_meta["obs_id"],
                    frame_meta["detector"],
                    frame_meta["band"],
                    frame_meta["processing_version"]
                )
                
                if full_meta:
                    conn = get_connection(db_path)
                    cur = conn.cursor()
                    
                    try:
                        upsert_frame(cur, full_meta)
                        
                        # Compute cell mappings
                        footprint = json.loads(full_meta["footprint"])
                        cells = footprint_overlaps_cells(footprint)
                        insert_frame_cells(cur, full_meta["frame_id"], cells)
                        
                        conn.commit()
                        
                        # Track newest planning period
                        pp = full_meta["planning_period"]
                        if newest_planning_period is None or pp > newest_planning_period:
                            newest_planning_period = pp
                        
                        frames_ingested += 1
                        print(f"Ingested frame {frames_ingested}: {full_meta['frame_id']}")
                        
                    finally:
                        conn.close()
    
    # Process all regions
    tasks = [process_region(*r) for r in regions]
    await asyncio.gather(*tasks)
    
    # Update status
    conn = get_connection(db_path)
    cur = conn.cursor()
    update_status(cur, "last_ingest_at", datetime.now(timezone.utc).isoformat())
    update_status(cur, "newest_planning_period", newest_planning_period)
    update_status(cur, "frames_indexed", frames_ingested)
    conn.commit()
    conn.close()
    
    print(f"Ingestion complete: {frames_ingested} frames indexed")
    return frames_ingested


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest SPHEREx frame metadata")
    parser.add_argument("--ra", type=float, help="RA center for region query")
    parser.add_argument("--dec", type=float, help="Dec center for region query")
    parser.add_argument("--radius", type=float, default=2.0, help="Query radius in degrees")
    parser.add_argument("--max-frames", type=int, help="Maximum frames to ingest")
    parser.add_argument("--db", type=str, help="Database path")
    
    args = parser.parse_args()
    
    region = None
    if args.ra is not None and args.dec is not None:
        region = (args.ra, args.dec, args.radius)
    
    asyncio.run(run_ingest(region=region, max_frames=args.max_frames, db_path=args.db))
