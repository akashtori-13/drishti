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
    assert api_cache_get(db, "k", 0.01) is None  # expiry path exercised
    assert api_cache_get(db, "missing", 60) is None
    # stale reads survive outages
    api_cache_set(db, "s", [1])
    assert api_cache_get(db, "s", 3600, allow_stale=True) == [1]


def test_skybot_breaker_skips_network(tmp_path):
    import asyncio
    import time
    from backend.cache import init_db, set_status
    from backend import crossmatch
    db = str(tmp_path / "br.db")
    init_db(db)
    # tripped breaker: future dead_until -> immediate None, no network
    set_status(db, "skybot:dead_until", str(time.time() + 3600))
    t0 = time.time()
    out = asyncio.run(crossmatch.query_skybot(180.0, 0.0, 60800.0, 60.0, db_path=db))
    assert out is None and (time.time() - t0) < 5
    # streak counting: three failures trip the breaker (no network stubbed by 404 host)
    set_status(db, "skybot:dead_until", "0")
    set_status(db, "skybot:fail_streak", "2")
    out = asyncio.run(crossmatch.query_skybot(180.0, 0.0, 60800.0, 60.0, db_path=db))
    assert out is None
    from backend.cache import get_status
    assert float(get_status(db, "skybot:dead_until") or 0) > time.time()


def test_flag_variable():
    from backend.pipeline import flag_variable
    assert flag_variable([{"flux": 100.0, "flux_err": 5.0}, {"flux": 400.0, "flux_err": 5.0}])
    assert not flag_variable([{"flux": 100.0, "flux_err": 5.0}, {"flux": 110.0, "flux_err": 5.0}])
    assert not flag_variable([{"flux": 100.0, "flux_err": 150.0}, {"flux": 400.0, "flux_err": 150.0}])
    assert not flag_variable([])
    assert not flag_variable([{"flux": None}])


def test_sample_hits_two_returns_oldest_newest():
    from backend.pipeline import _sample_hits
    hits = [{"mjd": 60000.0 + i * 100, "cutout_url": f"u{i}"} for i in (3, 1, 4, 0, 2)]
    picks = _sample_hits(hits, 2)
    assert [h["mjd"] for h in picks] == [60000.0, 60400.0]


def test_sample_hits_full_span_included():
    from backend.pipeline import _sample_hits
    hits = [{"mjd": 60000.0 + i * 10} for i in range(20)]
    picks = _sample_hits(hits, 8)
    mjds = [h["mjd"] for h in picks]
    assert mjds[0] == 60000.0 and mjds[-1] == 60190.0
    assert mjds == sorted(mjds) and len(mjds) == 8
