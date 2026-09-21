"""First-version tests: wavelength gate, showcase schema, cache, API health."""
import json


def test_wavelength_gate():
    from backend.cutouts import tolerance, wavelengths_match
    assert tolerance(0.4) == 0.2
    assert wavelengths_match(2.0, 0.4, 2.1, 0.4)
    assert not wavelengths_match(2.0, 0.4, 2.5, 0.4)
    assert not wavelengths_match(2.0, 0.0, 2.0, 0.0)


def test_bandpass_names_cover_d1_d6():
    from backend.config import BANDPASS_NAMES
    assert [BANDPASS_NAMES[i] for i in range(1, 7)] == [f"SPHEREx-D{i}" for i in range(1, 7)]


def test_showcase_schema():
    from pathlib import Path
    from backend.app import SHOWCASE_IDS
    base = Path(__file__).parent.parent.parent / "spectrahunt-web" / "public" / "showcases"
    assert len(SHOWCASE_IDS) >= 15
    for sid in SHOWCASE_IDS:
        doc = json.loads((base / f"{sid}.json").read_text())
        assert doc["id"] == sid
        assert -90 <= doc["dec"] <= 90 and 0 <= doc["ra"] < 360
        assert len(doc["epochs"]) == 2
        for ep in doc["epochs"]:
            assert ep["label"] and ep.get("band") in (None, 1, 2, 3, 4, 5, 6)


def test_cache_roundtrip(tmp_path):
    from backend.cache import cache_skybot, get_cached_skybot, get_status, init_db, set_status
    db = str(tmp_path / "scratch.db")
    init_db(db)
    set_status(db, "last_run", "2026-01-01")
    assert get_status(db, "last_run") == "2026-01-01"
    cache_skybot(db, 180.123456, 0.123456, 60700.123456, 10.0, [{"name": "Ceres"}])
    assert get_cached_skybot(db, 180.123456, 0.123456, 60700.123456, 10.0) == [{"name": "Ceres"}]


def test_api_health_and_showcases():
    from fastapi.testclient import TestClient
    from backend.app import app
    c = TestClient(app)
    assert c.get("/health").json()["ok"] is True
    ids = {s["id"] for s in c.get("/api/showcases").json()}
    assert {"3i-atlas", "ecliptic-mover", "nep-deep"} <= ids
    doc = c.get("/api/showcase/3i-atlas").json()
    assert doc["id"] == "3i-atlas" and len(doc["epochs"]) == 2
    assert c.get("/api/showcase/nope").status_code == 404
