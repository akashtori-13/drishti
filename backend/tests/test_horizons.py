"""Horizons helper tests. positions() runs off the committed cache file,
so these never touch the network."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.horizons import positions, separation_arcsec  # noqa: E402


def test_separation_known():
    # 1 degree at the equator = 3600 arcsec
    assert abs(separation_arcsec(0.0, 0.0, 1.0, 0.0) - 3600.0) < 1.0


def test_positions_cached_span():
    pos = positions("3I", [60888.33, 61023.46])
    assert len(pos) == 2
    # Aug 2025: comet sits on the showcase aperture (by design of the field)
    assert separation_arcsec(252.6633, -17.4904, *pos[0]) < 3600.0
    # Dec 2025: far side of the sky from the aperture
    assert separation_arcsec(252.6633, -17.4904, *pos[1]) > 45 * 3600.0


def test_positions_monotonic_midpoint():
    a, b, c = positions("3I", [60888.33, 60955.0, 61023.46])
    # midpoint RA lies between endpoints along the direction of travel
    assert min(a[0], c[0]) <= b[0] <= max(a[0], c[0]) or abs(a[0] - c[0]) > 300
