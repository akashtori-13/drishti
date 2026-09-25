"""Masked-core photometry: median-fill must not silently wipe source flux."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.photometry import aperture_flux  # noqa: E402


def _star(shape=(29, 29), cx=14.0, cy=14.0, core=100.0, bg=0.5):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    img = bg + core * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / 2.0)
    return img


def test_unmasked_path_unchanged():
    img = _star()
    r = aperture_flux(img, 14.0, 14.0)
    assert r["masked_frac"] == 0.0 and r["core_masked"] is False
    assert r["npix"] > 20 and r["flux"] > 0


def test_flagged_core_excluded_and_flagged():
    img = _star()
    mask = np.zeros(img.shape, dtype=bool)
    mask[14, 14] = True  # cosmic on the stellar core
    filled = img.copy()
    filled[mask] = np.nanmedian(img[~mask])
    r = aperture_flux(filled, 14.0, 14.0, mask=mask)
    assert r["core_masked"] is True
    assert r["masked_frac"] > 0
    # area-corrected, error inflated vs the silently-filled equivalent
    plain = aperture_flux(filled, 14.0, 14.0)
    assert r["flux_err"] > plain["flux_err"]
    assert r["flux"] > plain["flux"]  # no longer core-wiped to background


def test_flagged_off_core_keeps_core():
    img = _star()
    mask = np.zeros(img.shape, dtype=bool)
    mask[14, 16] = True  # wing pixel inside the aperture
    filled = img.copy()
    filled[mask] = np.nanmedian(img[~mask])
    r = aperture_flux(filled, 14.0, 14.0, mask=mask)
    assert r["core_masked"] is False
    assert r["masked_frac"] > 0
