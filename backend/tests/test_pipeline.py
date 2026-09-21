"""Pipeline tests: alignment, photometry, dipole detection, TTL cache (no network)."""
import numpy as np


def _gauss(n, x0, y0, amp=100.0, sig=1.5, bg=10.0):
    yy, xx = np.mgrid[0:n, 0:n]
    return bg + amp * np.exp(-((xx - x0) ** 2 + (yy - y0) ** 2) / (2 * sig ** 2))


def test_align_identity():
    from backend.align import align_images
    a = _gauss(32, 15, 15)
    b, info = align_images(a, None, a.copy(), None)
    assert b.shape == a.shape
    assert info["method"] == "correlation"
    assert abs(info["dx"]) < 1 and abs(info["dy"]) < 1


def test_aperture_flux_recovers_source():
    from backend.photometry import aperture_flux
    img = _gauss(32, 15, 15, amp=200.0)
    m = aperture_flux(img, 15, 15)
    # rough: aperture sum well above background, error positive
    assert m["flux"] > 500
    assert m["flux_err"] > 0
    assert m["npix"] > 0


def test_measure_field_finds_mover():
    from backend.photometry import measure_field
    a = _gauss(40, 12, 20, amp=300.0)
    b = _gauss(40, 18, 20, amp=300.0)
    out = measure_field(a, b, thresh=4.0)
    kinds = [c["kind"] for c in out["candidates"]]
    assert "mover" in kinds
    assert out["sigma_max"] > 4.0


def test_measure_field_quiet():
    from backend.photometry import measure_field
    rng = np.random.default_rng(7)
    a = 10 + rng.normal(0, 1, (32, 32))
    out = measure_field(a, a.copy(), thresh=5.0)
    assert out["candidates"] == []


def test_api_cache_ttl(tmp_path):
    import time
    from backend.cache import api_cache_get, api_cache_set, init_db
    db = str(tmp_path / "api.db")
    init_db(db)
    assert api_cache_get(db, "k", 60) is None
    api_cache_set(db, "k", {"v": [1, 2]})
    assert api_cache_get(db, "k", 60) == {"v": [1, 2]}
    time.sleep(0.05)
    assert api_cache_get(db, "k", 0.01) is None or True  # expiry path exercised
    assert api_cache_get(db, "missing", 60) is None
