"""
Unit tests for SpectraHunt backend.

Run with: pytest backend/tests/ -v
"""

import pytest
import numpy as np


class TestCoordinateParsing:
    """Test coordinate parsing and cell indexing."""
    
    def test_cell_of_basic(self):
        """Test basic RA/Dec to cell conversion."""
        from backend.config import GRID_W, GRID_H
        
        # Center of cell (0, 0)
        ra, dec = 2.5, 87.5  # Top-left corner
        i = min(GRID_W - 1, max(0, int(ra / 360 * GRID_W)))
        j = min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H)))
        assert i == 0
        assert j == 0
        
        # Center of grid
        ra, dec = 180, 0
        i = min(GRID_W - 1, max(0, int(ra / 360 * GRID_W)))
        j = min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H)))
        assert i == GRID_W // 2
        assert j == GRID_H // 2
    
    def test_cell_bounds(self):
        """Test that cells stay within bounds."""
        from backend.config import GRID_W, GRID_H
        
        for ra in [0, 90, 180, 270, 359.9]:
            for dec in [-89.9, -45, 0, 45, 89.9]:
                i = min(GRID_W - 1, max(0, int(ra / 360 * GRID_W)))
                j = min(GRID_H - 1, max(0, int((90 - dec) / 180 * GRID_H)))
                assert 0 <= i < GRID_W
                assert 0 <= j < GRID_H


class TestWavelengthMatching:
    """Test wavelength matching logic."""
    
    def test_wavelengths_match(self):
        """Test wavelength matching tolerance."""
        from backend.cutouts import wavelengths_match
        
        # Same wavelength should match
        assert wavelengths_match(2.0, 0.4, 2.0, 0.4)
        
        # Within tolerance should match
        assert wavelengths_match(2.0, 0.4, 2.1, 0.4)
        
        # Outside tolerance should not match
        assert not wavelengths_match(2.0, 0.4, 2.5, 0.4)
    
    def test_tolerance_calculation(self):
        """Test tolerance calculation."""
        from backend.cutouts import compute_wavelength_match_tolerance
        
        # Tolerance = 0.5 × bandwidth
        tol = compute_wavelength_match_tolerance(0.4)
        assert tol == 0.2


class TestDipolePairing:
    """Test dipole pairing logic."""
    
    def test_pair_dipoles_basic(self):
        """Test basic dipole pairing."""
        from backend.detect import pair_dipoles
        from backend.config import PIXEL_SCALE_ARCSEC
        
        # Create a simple positive-negative pair
        sources_pos = [{"x": 100.0, "y": 100.0, "flux": 100.0, "flux_err": 10.0}]
        sources_neg = [{"x": 103.0, "y": 100.0, "flux": 95.0, "flux_err": 10.0}]
        
        pairs = pair_dipoles(sources_pos, sources_neg)
        
        assert len(pairs) == 1
        src_a, src_b, motion = pairs[0]
        assert motion["motion_arcsec"] > 0
        assert motion["position_angle_deg"] >= 0
    
    def test_pair_dipoles_rejects_far(self):
        """Test that distant pairs are rejected."""
        from backend.detect import pair_dipoles
        
        # Sources too far apart
        sources_pos = [{"x": 100.0, "y": 100.0, "flux": 100.0, "flux_err": 10.0}]
        sources_neg = [{"x": 200.0, "y": 100.0, "flux": 95.0, "flux_err": 10.0}]
        
        pairs = pair_dipoles(sources_pos, sources_neg)
        assert len(pairs) == 0


class TestCandidateScoring:
    """Test candidate scoring."""
    
    def test_score_formula(self):
        """Test scoring formula components."""
        from backend.detect import score_candidate
        
        # High significance, good dipole, multiple pairs
        score = score_candidate(
            significance_sigma=10.0,
            dipole_quality=0.9,
            num_matched_pairs=3,
            multi_band_agreement=True
        )
        assert 0 <= score <= 1.0
        
        # Low significance, poor dipole
        score_low = score_candidate(
            significance_sigma=2.0,
            dipole_quality=0.2,
            num_matched_pairs=1,
            multi_band_agreement=False
        )
        assert score_low < score


class TestHTMLEscaping:
    """Test HTML escaping for security."""
    
    def test_esc_function(self):
        """Test HTML escaping."""
        from backend.app import esc
        
        assert esc("<script>") == "&lt;script&gt;"
        assert esc("a & b") == "a &amp; b"
        assert esc('"quotes"') == "&quot;quotes&quot;"


class TestDatabaseSchema:
    """Test database initialization."""
    
    def test_init_db_creates_tables(self):
        """Test that init_db creates all required tables."""
        from backend.db import init_db, get_connection
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        
        try:
            init_db(db_path)
            conn = get_connection(db_path)
            cur = conn.cursor()
            
            # Check tables exist
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cur.fetchall()}
            
            expected = {"frames", "frame_cell_map", "candidates", "skybot_cache", "ingest_status"}
            assert expected.issubset(tables)
            
            conn.close()
        finally:
            os.unlink(db_path)


class TestConfigConstants:
    """Test that config has all required constants."""
    
    def test_config_complete(self):
        """Test config.py has all required settings."""
        from backend import config
        
        # Required endpoints
        assert hasattr(config, "IRSA_SIA2_ENDPOINT")
        assert hasattr(config, "SKYBOT_ENDPOINT")
        
        # Required release info
        assert config.RELEASE == "QR2"
        assert hasattr(config, "RELEASE_DOI")
        
        # Required bands
        assert len(config.BANDS) == 6
        
        # Required grid
        assert config.GRID_W == 72
        assert config.GRID_H == 36
