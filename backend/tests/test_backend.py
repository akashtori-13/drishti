"""Unit tests for SpectraHunt backend. Run: pytest backend/tests/ -v"""
import json


class TestCoordinateParsing:
    def test_cell_of_basic(self):
        from backend.db import cell_of, GRID_W, GRID_H
        assert cell_of(2.5, 87.5) == (0, 0)
        assert cell_of(180, 0) == (GRID_W // 2, GRID_H // 2)

    def test_cell_bounds(self):
        from backend.db import cell_of, GRID_W, GRID_H
        for ra in [0, 90, 180, 270, 359.9]:
            for dec in [-89.9, -45, 0, 45, 89.9]:
                i, j = cell_of(ra, dec)
                assert 0 <= i < GRID_W
                assert 0 <= j < GRID_H


class TestWavelengthMatching:
    def test_wavelengths_match(self):
        from backend.cutouts import wavelengths_match
        assert wavelengths_match(2.0, 0.4, 2.0, 0.4)
        assert wavelengths_match(2.0, 0.4, 2.1, 0.4)
        assert not wavelengths_match(2.0, 0.4, 2.5, 0.4)

    def test_tolerance_calculation(self):
        from backend.cutouts import compute_wavelength_match_tolerance
        assert compute_wavelength_match_tolerance(0.4) == 0.2


class TestDipolePairing:
    def test_pair_dipoles_basic(self):
        from backend.detect import pair_dipoles
        pos = [{"x": 100.0, "y": 100.0, "flux": 100.0}]
        neg = [{"x": 103.0, "y": 100.0, "flux": 95.0}]
        dipoles = pair_dipoles(pos, neg)
        assert len(dipoles) == 1
        assert 0 <= dipoles[0]["position_angle_deg"] < 360

    def test_pair_dipoles_rejects_distant(self):
        from backend.detect import pair_dipoles
        pos = [{"x": 0.0, "y": 0.0, "flux": 100.0}]
        neg = [{"x": 500.0, "y": 500.0, "flux": 100.0}]
        assert pair_dipoles(pos, neg) == []


class TestDatabase:
    def test_init_and_status_roundtrip(self, tmp_path):
        from backend.db import init_db, update_status, get_status, get_connection
        db = str(tmp_path / "t.db")
        init_db(db)
        conn = get_connection(db)
        try:
            update_status(conn.cursor(), "last_ingest_at", "2026-01-01")
            conn.commit()
            assert get_status(conn, "last_ingest_at") == "2026-01-01"
        finally:
            conn.close()

    def test_skybot_cache_roundtrip(self, tmp_path):
        from backend.db import init_db, cache_skybot_result, get_cached_skybot
        db = str(tmp_path / "t2.db")
        init_db(db)
        cache_skybot_result(db, 180.123456, 0.123456, 60700.123456, 10.0, [{"name": "Ceres"}])
        cached = get_cached_skybot(db, 180.123456, 0.123456, 60700.123456, 10.0)
        assert cached == [{"name": "Ceres"}]
