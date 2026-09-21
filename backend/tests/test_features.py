"""Mover detection + motion math tests (no network)."""


def test_detect_peak_finder():
    import numpy as np
    from backend.detect import detect_sources, match_epochs
    img = np.full((24, 24), 10.0)
    img[4:7, 4:7] = 500.0
    img[14:17, 17:20] = 300.0
    srcs = detect_sources(img, threshold_sigma=3.0)
    assert len(srcs) >= 2
    assert any(abs(s["x"] - 5) < 2 and abs(s["y"] - 5) < 2 for s in srcs)


def test_match_epochs_mover_and_variable():
    from backend.detect import match_epochs
    a = [{"x": 5.0, "y": 5.0, "flux": 100.0}]
    b = [{"x": 12.0, "y": 5.0, "flux": 100.0}]
    m = match_epochs(a, b, max_match_px=3.0)
    assert m["matched"] == 0
    assert len(m["movers"]) == 2
    a2 = [{"x": 5.0, "y": 5.0, "flux": 100.0}]
    b2 = [{"x": 5.2, "y": 5.1, "flux": 400.0}]
    m2 = match_epochs(a2, b2)
    assert m2["matched"] == 1
    assert len(m2["variables"]) == 1


def test_arcsec_per_day():
    from backend.detect import arcsec_per_day
    # 1 arcmin / day at equator
    assert abs((arcsec_per_day(0, 0, 1 / 60, 0, 1.0) or 0) - 60.0) < 1.0
    assert arcsec_per_day(0, 0, 0, 0, 0) is None
    assert arcsec_per_day(0, 0, 0, 0, -3) is None


def test_detect_endpoint_shape():
    from fastapi.testclient import TestClient
    from backend.app import app
    c = TestClient(app)
    # monkeypatch discovery to avoid network: no covering images -> graceful []
    import backend.app as appmod
    import backend.epochs as epochsmod
    real = epochsmod.discover_epochs
    epochsmod.discover_epochs = lambda *a, **k: []
    try:
        r = c.get("/api/detect?ra=180&dec=0&band=3")
        assert r.status_code == 200
        body = r.json()
        assert body["candidates"] == [] and body["matched"] == 0
    finally:
        epochsmod.discover_epochs = real
        assert appmod is not None
