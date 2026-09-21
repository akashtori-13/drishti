"""
Detection pipeline for SpectraHunt.

Performs difference imaging on wavelength-matched epoch pairs,
extracts sources with SEP, pairs dipoles, and scores candidates.

Run as: python -m backend.detect
Or:     python scripts/build_static_bundle.py (which calls this correctly)
"""

import hashlib
import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp
import sep

# Add parent directory to path so relative imports work when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import (
    DETECTION_SIGMA_THRESHOLD, DIPOLE_MAX_SEPARATION_ARCSEC,
    DIPOLE_MAX_MOTION_ARCSEC_PER_DAY, SKYBOT_MATCH_RADIUS_ARCSEC,
    PIXEL_SCALE_ARCSEC
)
from backend.cutouts import (
    get_or_render_cutout_png, parse_cutout_fits, mask_bad_pixels,
    wavelengths_match, compute_wavelength_match_tolerance
)
from backend.db import get_connection, insert_candidate
from backend.crossmatch import query_skybot


def load_and_reproject_cutouts(
    cutouts: List[Dict[str, Any]]
) -> Tuple[np.ndarray, WCS, List[np.ndarray]]:
    """
    Load cutout images and reproject to common WCS grid.
    
    Returns (common_wcs, image_stack, masks) where:
    - common_wcs: WCS of the reference frame (first epoch)
    - image_stack: list of reprojected image arrays
    - masks: list of boolean masks (True = bad pixel)
    """
    if not cutouts:
        return None, [], []
    
    # Use first epoch as reference
    ref_data = parse_cutout_fits(Path(cutouts[0]["fits_path"]))
    ref_image = ref_data["image"]
    ref_wcs = ref_data["wcs"]
    
    if ref_image is None or ref_wcs is None:
        return None, [], []
    
    image_stack = []
    masks = []
    
    for cutout in cutouts:
        data = parse_cutout_fits(Path(cutout["fits_path"]))
        if data["image"] is None:
            continue
        
        # Mask bad pixels
        image, mask = mask_bad_pixels(data["image"], data.get("flags"), data.get("variance"))
        
        # Reproject to reference WCS
        try:
            reprojected, _ = reproject_interp(
                (image, data["wcs"]),
                ref_wcs,
                shape_out=ref_image.shape
            )
            reprojected_mask, _ = reproject_interp(
                (mask.astype(float), data["wcs"]),
                ref_wcs,
                shape_out=ref_image.shape
            )
            
            image_stack.append(np.nan_to_num(reprojected, nan=0.0))
            masks.append(reprojected_mask > 0.5)
        except Exception as e:
            print(f"Reprojection failed: {e}")
            # Fall back to original if reprojection fails
            image_stack.append(np.nan_to_num(image, nan=0.0))
            masks.append(mask)
    
    return ref_wcs, image_stack, masks


def subtract_background(
    image: np.ndarray,
    mask: np.ndarray,
    box_size: int = 64
) -> np.ndarray:
    """
    Subtract background using SEP Background2D.
    
    Returns background-subtracted image.
    """
    # Make C-contiguous float32 (SEP requirement)
    img = np.ascontiguousarray(image.astype(np.float32))
    msk = np.ascontiguousarray(mask)
    
    try:
        bkg = sep.Background(img, mask=msk, boxsize=box_size)
        return img - bkg.back()
    except Exception as e:
        print(f"Background subtraction failed: {e}")
        return img


def extract_sources(
    image: np.ndarray,
    mask: np.ndarray,
    sigma_threshold: float = DETECTION_SIGMA_THRESHOLD
) -> List[Dict[str, Any]]:
    """
    Extract sources from image using SEP.
    
    Returns list of source dicts with position, flux, etc.
    """
    # Make C-contiguous float32 (SEP requirement)
    img = np.ascontiguousarray(image.astype(np.float32))
    msk = np.ascontiguousarray(mask)
    
    # Compute noise image (simple estimate)
    valid = img[~msk]
    if len(valid) < 100:
        return []
    
    noise_level = np.std(valid)
    err = np.ones_like(img) * noise_level
    
    try:
        # Extract sources
        objs = sep.extract(
            img,
            sigma_threshold,
            err=err,
            mask=msk,
            minarea=5,
            deblender=False
        )
        
        sources = []
        for obj in objs:
            sources.append({
                "x": float(obj["x"]),
                "y": float(obj["y"]),
                "flux": float(obj["flux"]),
                "flux_err": float(obj["fluxerr"]),
                "a": float(obj["a"]),  # semi-major axis
                "b": float(obj["b"]),  # semi-minor axis
                "theta": float(obj["theta"]),  # position angle
                "peak": float(obj["peak"])
            })
        
        return sources
    except Exception as e:
        print(f"SEP extraction failed: {e}")
        return []


def pair_dipoles(
    sources_a: List[Dict],
    sources_b: List[Dict],
    max_separation_arcsec: float = DIPOLE_MAX_SEPARATION_ARCSEC,
    pixel_scale: float = PIXEL_SCALE_ARCSEC
) -> List[Tuple[Dict, Dict, Dict]]:
    """
    Pair positive and negative sources into dipoles.
    
    A real moving object produces a positive-negative pair in the difference image.
    
    Returns list of (pos_source, neg_source, motion_info) tuples.
    """
    max_sep_pix = max_separation_arcsec / pixel_scale
    pairs = []
    
    used_b = set()
    
    for src_a in sources_a:
        for i_b, src_b in enumerate(sources_b):
            if i_b in used_b:
                continue
            
            # Check separation
            dx = src_a["x"] - src_b["x"]
            dy = src_a["y"] - src_b["y"]
            sep_pix = np.sqrt(dx**2 + dy**2)
            
            if sep_pix > max_sep_pix:
                continue
            
            # Check flux similarity (should be similar magnitude, opposite sign)
            flux_ratio = abs(src_a["flux"] / max(src_b["flux"], 1e-10))
            if flux_ratio < 0.3 or flux_ratio > 3.0:
                continue
            
            # Compute motion vector
            motion_arcsec = sep_pix * pixel_scale
            pa_deg = np.degrees(np.arctan2(dy, dx)) % 360
            
            pairs.append((src_a, src_b, {
                "separation_pix": float(sep_pix),
                "motion_arcsec": float(motion_arcsec),
                "position_angle_deg": float(pa_deg),
                "dx_pix": float(dx),
                "dy_pix": float(dy)
            }))
            
            used_b.add(i_b)
            break
    
    return pairs


def score_candidate(
    significance_sigma: float,
    dipole_quality: float,
    num_matched_pairs: int,
    multi_band_agreement: bool = False
) -> float:
    """
    Score a candidate.
    
    Simple explainable formula combining:
    - Detection significance
    - Quality of dipole pairing
    - Number of wavelength-matched pairs
    - Multi-band agreement
    
    Returns total score.
    """
    score = (
        0.4 * min(significance_sigma / 10.0, 1.0) +
        0.3 * dipole_quality +
        0.2 * min(num_matched_pairs / 3.0, 1.0) +
        (0.1 if multi_band_agreement else 0.0)
    )
    return score


async def detect_movers_in_cell(
    db_path: str,
    cell_i: int,
    cell_j: int,
    band: int,
    ra_center: float,
    dec_center: float
):
    """
    Run detection pipeline for a single sky cell and band.
    
    Steps:
    1. Get all epochs' frames for this cell/band
    2. Fetch cutouts for each epoch
    3. Select wavelength-matched pairs
    4. Difference matched pairs
    5. Extract sources with SEP
    6. Pair dipoles
    7. Cross-match with SkyBoT
    8. Score and persist candidates
    """
    conn = get_connection(db_path)
    cur = conn.cursor()
    
    # Get frames for this cell and band
    cur.execute("""
        SELECT f.* FROM frames f
        JOIN frame_cell_map fcm ON f.frame_id = fcm.frame_id
        WHERE fcm.cell_i = ? AND fcm.cell_j = ? AND f.band = ?
        ORDER BY f.mjd_obs
    """, (cell_i, cell_j, band))
    
    frames = cur.fetchall()
    if len(frames) < 2:
        conn.close()
        return 0
    
    # Group by planning period (epoch)
    epochs = {}
    for frame in frames:
        pp = frame["planning_period"]
        if pp not in epochs:
            epochs[pp] = []
        epochs[pp].append(dict(frame))
    
    # Get wavelength info for each epoch and find matched pairs
    epoch_data = []
    for pp, frame_list in epochs.items():
        # Use first detector for this epoch
        frame = frame_list[0]
        
        # Fetch cutout to get wavelength
        cutout_result = await get_or_render_cutout_png(
            frame["access_url"],
            ra_center, dec_center, band
        )
        
        if cutout_result:
            epoch_data.append({
                "planning_period": pp,
                "frame": frame,
                "cutout": cutout_result,
                "wavelength_um": cutout_result.get("wavelength_um"),
                "bandwidth_um": cutout_result.get("bandwidth_um"),
                "mjd_obs": frame["mjd_obs"]
            })
    
    # Find wavelength-matched consecutive pairs
    matched_pairs = []
    for i in range(len(epoch_data) - 1):
        ep_a = epoch_data[i]
        ep_b = epoch_data[i + 1]
        
        if ep_a["wavelength_um"] and ep_b["wavelength_um"]:
            if ep_a["bandwidth_um"] and ep_b["bandwidth_um"]:
                if wavelengths_match(
                    ep_a["wavelength_um"], ep_a["bandwidth_um"],
                    ep_b["wavelength_um"], ep_b["bandwidth_um"]
                ):
                    matched_pairs.append((ep_a, ep_b))
    
    if not matched_pairs:
        print(f"No wavelength-matched pairs for cell ({cell_i}, {cell_j}), band {band}")
        conn.close()
        return 0
    
    # Process each matched pair
    candidates_found = 0
    
    for ep_a, ep_b in matched_pairs:
        # Load and reproject cutouts
        wcs, images, masks = load_and_reproject_cutouts([ep_a["cutout"], ep_b["cutout"]])
        
        if len(images) < 2:
            continue
        
        # Subtract backgrounds
        img_a_bg = subtract_background(images[0], masks[0])
        img_b_bg = subtract_background(images[1], masks[1])
        
        # Difference: B - A
        diff = img_b_bg - img_a_bg
        diff_mask = masks[0] | masks[1]
        
        # Also do A - B to catch both polarities
        diff_inv = -diff
        
        # Extract sources from both difference images
        sources_pos = extract_sources(diff, diff_mask)
        sources_neg = extract_sources(diff_inv, diff_mask)
        
        # Pair dipoles
        dipoles = pair_dipoles(sources_pos, sources_neg)
        
        # Process each dipole as a candidate
        for src_pos, src_neg, motion in dipoles:
            # Convert pixel position to RA/Dec
            if wcs is not None:
                try:
                    ra, dec = wcs.all_pix2world([[src_pos["x"], src_pos["y"]]], 1)[0]
                    ra, dec = float(ra), float(dec)
                except:
                    ra, dec = ra_center, dec_center
            else:
                ra, dec = ra_center, dec_center
            
            # Compute time baseline and motion rate
            delta_mjd = abs(ep_b["mjd_obs"] - ep_a["mjd_obs"])
            motion_per_day = motion["motion_arcsec"] / max(delta_mjd, 0.001)
            
            # Cap at physically plausible motion
            if motion_per_day > DIPOLE_MAX_MOTION_ARCSEC_PER_DAY:
                continue
            
            # Cross-match with SkyBoT
            skybot_match = await query_skybot(
                ra, dec,
                (ep_a["mjd_obs"] + ep_b["mjd_obs"]) / 2,
                SKYBOT_MATCH_RADIUS_ARCSEC,
                db_path
            )
            
            # Score candidate
            significance = src_pos["flux"] / max(src_pos["flux_err"], 1e-10)
            dipole_quality = 1.0 - (motion["separation_pix"] / (DIPOLE_MAX_SEPARATION_ARCSEC / PIXEL_SCALE_ARCSEC))
            dipole_quality = max(0, min(1, dipole_quality))
            
            total_score = score_candidate(
                significance,
                dipole_quality,
                len(matched_pairs),
                multi_band_agreement=False  # Would need multi-band processing
            )
            
            # Generate candidate ID
            cand_id = hashlib.md5(
                f"{cell_i}_{cell_j}_{band}_{ep_a['planning_period']}_{ra:.4f}_{dec:.4f}".encode()
            ).hexdigest()[:12]
            
            # Name: SH-<cell>-<n> format (honest placeholder, not MPC-style)
            cand_name = f"SH-{cell_i:02d}{cell_j:02d}-{candidates_found + 1}"
            
            candidate = {
                "id": cand_id,
                "name": cand_name,
                "ra": ra,
                "dec": dec,
                "band": band,
                "epoch_a": ep_a["planning_period"],
                "epoch_b": ep_b["planning_period"],
                "mjd_a": ep_a["mjd_obs"],
                "mjd_b": ep_b["mjd_obs"],
                "significance_sigma": float(significance),
                "motion_arcsec": motion["motion_arcsec"],
                "motion_pa_deg": motion["position_angle_deg"],
                "motion_arcsec_per_day": float(motion_per_day),
                "skybot_match": skybot_match,
                "status": "pending",
                "score_components": {
                    "significance": float(significance),
                    "dipole_quality": float(dipole_quality),
                    "num_pairs": len(matched_pairs),
                    "total_score": float(total_score)
                },
                "thumb_urls": [
                    ep_a["cutout"]["png_url"],
                    ep_b["cutout"]["png_url"]
                ],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "cell_i": cell_i,
                "cell_j": cell_j
            }
            
            insert_candidate(cur, candidate)
            candidates_found += 1
    
    conn.commit()
    conn.close()
    return candidates_found


async def run_detection(
    db_path: Optional[str] = None,
    cell_i: Optional[int] = None,
    cell_j: Optional[int] = None,
    band: Optional[int] = None
):
    """
    Run detection pipeline.
    
    Can run on specific cell/band or iterate over all indexed cells.
    """
    from .db import get_coverage_counts, GRID_W, GRID_H
    from .config import BANDS
    
    if db_path is None:
        from .config import DATABASE_PATH
        db_path = DATABASE_PATH
    
    conn = get_connection(db_path)
    cur = conn.cursor()
    counts, indexed = get_coverage_counts(cur)
    conn.close()
    
    total_candidates = 0
    
    # Determine which cells to process
    cells_to_process = []
    for j in range(GRID_H):
        for i in range(GRID_W):
            if cell_i is not None and i != cell_i:
                continue
            if cell_j is not None and j != cell_j:
                continue
            if indexed[j][i]:
                cells_to_process.append((i, j))
    
    # Determine which bands to process
    bands_to_process = list(range(1, 7))
    if band is not None:
        bands_to_process = [band]
    
    # Run detection for each cell/band combination
    for i, j in cells_to_process:
        # Get cell center for cutout targeting
        ra_center = (i + 0.5) / GRID_W * 360
        dec_center = 90 - (j + 0.5) / GRID_H * 180
        
        for b in bands_to_process:
            n = await detect_movers_in_cell(db_path, i, j, b, ra_center, dec_center)
            total_candidates += n
            if n > 0:
                print(f"Cell ({i},{j}), Band {b}: found {n} candidates")
    
    print(f"Detection complete: {total_candidates} candidates found")
    return total_candidates


if __name__ == "__main__":
    import argparse
    import asyncio
    
    parser = argparse.ArgumentParser(description="Run SPHEREx moving object detection")
    parser.add_argument("--cell-i", type=int, help="Process specific cell i")
    parser.add_argument("--cell-j", type=int, help="Process specific cell j")
    parser.add_argument("--band", type=int, help="Process specific band (1-6)")
    parser.add_argument("--db", type=str, help="Database path")
    
    args = parser.parse_args()
    
    asyncio.run(run_detection(
        db_path=args.db,
        cell_i=args.cell_i,
        cell_j=args.cell_j,
        band=args.band
    ))
