from backend.measurement import (
    MEASUREMENT_SCHEMA, build_evidence, from_track_point, parse_release, validate,
)


def pt(**kw):
    base = {
        "band": 3, "mjd": 61102.0, "flux": 1.0, "flux_err": 0.5,
        "wavelength_um": 2.02, "bandwidth_um": 0.05,
        "aper_masked_frac": 0.0, "core_masked": False, "npix": 9,
        "flags": 0, "track_ra": 1.0, "track_dec": 2.0,
        "url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2026W10_2B/l2b-v24-2026-094/3/x.fits",
        "source": "tap-tracked",
    }
    base.update(kw)
    return base


def test_parse_release_qr2():
    r = parse_release(pt()["url"])
    assert r == {"release": "qr2", "week": "2026W10_2B", "calibration": "l2b-v24"}


def test_parse_release_unknown():
    assert parse_release("https://example.com/x.fits")["release"] is None


def test_from_track_point_explicit_nulls():
    m = from_track_point(pt(), "1.0.0")
    assert m["schema"] == MEASUREMENT_SCHEMA
    assert m["response_ref"] is None and "pending-A1" in m["response_status"]
    assert m["psf_fwhm_px"] is None and m["zodi_aper"] is None
    assert m["wavelength_truth"] == "band-center-fallback"
    assert validate(m) == []


def test_validate_flags_null_flux_without_reason():
    m = from_track_point(pt(flux=None, core_masked=False), "1.0.0")
    assert any("null flux" in p for p in validate(m))


def test_build_evidence_roundtrip():
    track = {"mode": "horizons-tracked", "horizons_target": "3I",
             "n_points": 2, "n_attempted": 2,
             "points": [pt(), pt(flux=None, core_masked=True)]}
    ev = build_evidence("demo", track, "1.0.0", verdicts={"tests": []})
    assert ev["candidate"] == "demo"
    assert len(ev["measurements"]) == 2
    assert ev["validation_problems"] == []
