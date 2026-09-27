"""A2: native measurement + evidence capsule.

One candidate must be reconstructable from one packet: every point carries
its provenance (release, calibration, wavelength truth source, flags), and
unmeasured fields say so explicitly instead of being absent.

Schema version: MEASUREMENT_SCHEMA = 1.
"""
import re
from typing import Any, Optional

MEASUREMENT_SCHEMA = 1

# IBE URL pattern: .../spherex/<qr>/level2/<week>/l2b-v<NN>-.../<det>/level2_....fits
URL_RE = re.compile(
    r"/spherex/(?P<release>qr\d+)/level2/(?P<week>[^/]+)/l2b-v(?P<cal>[0-9]+)-"
)

WAVELENGTH_NOTE = (
    "band-center fallback (E0 UNDECIDED: cutout headers carry no parent "
    "offset; WCS-WAVE grid present but unmappable)"
)


def parse_release(url: str) -> dict:
    """Release + calibration identity parsed from an IBE cutout URL."""
    m = URL_RE.search(url or "")
    if not m:
        return {"release": None, "week": None, "calibration": None}
    return {
        "release": m.group("release"),
        "week": m.group("week"),
        "calibration": "l2b-v" + m.group("cal"),
    }


def from_track_point(pt: dict, pipeline_version: str) -> dict:
    """Build one measurement. Missing inputs become explicit nulls + reasons."""
    url = pt.get("url", "")
    m = {
        "schema": MEASUREMENT_SCHEMA,
        "band": pt.get("band"),
        "mjd": pt.get("mjd"),
        "flux": pt.get("flux"),
        "flux_err": pt.get("flux_err"),
        "wavelength_um": pt.get("wavelength_um"),
        "wavelength_truth": "band-center-fallback",
        "wavelength_note": WAVELENGTH_NOTE,
        "bandwidth_um": pt.get("bandwidth_um"),
        "aper_masked_frac": pt.get("aper_masked_frac"),
        "core_masked": pt.get("core_masked"),
        "npix": pt.get("npix"),
        "flags": pt.get("flags"),
        "track_ra": pt.get("track_ra"),
        "track_dec": pt.get("track_dec"),
        "cutout_url": url,
        "source": pt.get("source"),
        "pipeline_version": pipeline_version,
        # A1-gated: per-measurement response convolution (no response files yet).
        "response_ref": None,
        "response_status": "pending-A1 (no response files; bandwidth-ratio colour only)",
        # Per-point PSF/ZODI: extensions exist on L2 MEF but are not sampled
        # per aperture yet — explicit nulls, not silent gaps.
        "psf_fwhm_px": None,
        "psf_status": "unmeasured (PSF extension unread)",
        "zodi_aper": None,
        "zodi_status": "unmeasured (ZODI extension unread per-point)",
    }
    m.update(parse_release(url))
    return m


def validate(m: dict) -> list:
    """Return a list of problems (empty = valid packet member)."""
    problems = []
    if m.get("schema") != MEASUREMENT_SCHEMA:
        problems.append(f"schema != {MEASUREMENT_SCHEMA}")
    for key in ("band", "mjd", "cutout_url", "pipeline_version"):
        if m.get(key) is None:
            problems.append(f"missing {key}")
    if m.get("flux") is None and not m.get("core_masked"):
        problems.append("null flux without core_masked reason")
    rel = m.get("release")
    if rel not in ("qr2", "qr3", None):
        problems.append(f"unknown release {rel}")
    return problems


def build_evidence(candidate_id: str, track: dict, pipeline_version: str,
                   verdicts: Optional[Any] = None) -> dict:
    """Full evidence capsule for one candidate."""
    points = [from_track_point(p, pipeline_version) for p in track.get("points", [])]
    problems = [f"point {i}: {x}" for i, p in enumerate(points) for x in validate(p)]
    return {
        "schema": MEASUREMENT_SCHEMA,
        "candidate": candidate_id,
        "mode": track.get("mode"),
        "horizons_target": track.get("horizons_target"),
        "n_points": track.get("n_points"),
        "n_attempted": track.get("n_attempted"),
        "measurements": points,
        "verdicts": verdicts,
        "validation_problems": problems,
    }
