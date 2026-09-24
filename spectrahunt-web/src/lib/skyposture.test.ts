import { describe, expect, it } from 'vitest';
import {
  lerpAngle, normDeg, poseFromOrientation, radecFromAltAz, radecFromPose,
} from './skyposture';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function lstDeg(date: Date, lon: number): number {
  const d = date.getTime() / 86400000 - 10957.5;
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  return (((gmst + lon) % 360) + 360) % 360;
}

/** Independent textbook forward (Meeus): equatorial -> horizontal. */
function forward(ra: number, dec: number, lat: number, lon: number, date: Date) {
  const H = (lstDeg(date, lon) - ra) * D2R;
  const d = dec * D2R;
  const la = lat * D2R;
  const alt = Math.asin(Math.sin(d) * Math.sin(la) + Math.cos(d) * Math.cos(la) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(la) - Math.tan(d) * Math.cos(la));
  return { alt: alt * R2D, az: (((az * R2D + 180) % 360) + 360) % 360 };
}

describe('radecFromAltAz round-trip', () => {
  it('inverts the forward formula across sky, sites, and dates', () => {
    const dates = [new Date('2025-08-01T00:00:00Z'), new Date('2026-03-15T12:00:00Z')];
    const sites = [{ lat: 23.8, lon: 90.4 }, { lat: 40.7, lon: -74 }, { lat: -33.9, lon: 151.2 }];
    let n = 0;
    for (const date of dates) {
      for (const { lat, lon } of sites) {
        for (let ra = 0; ra < 360; ra += 37) {
          for (const dec of [-60, -20, 10, 45, 70]) {
            const { alt, az } = forward(ra, dec, lat, lon, date);
            if (Math.abs(alt) > 88 || alt < -2) continue; // singular / below horizon
            const back = radecFromAltAz(alt, az, lat, lon, date);
            let dra = Math.abs(back.ra - ra) % 360;
            if (dra > 180) dra = 360 - dra;
            expect(dra).toBeLessThan(0.05);
            expect(Math.abs(back.dec - dec)).toBeLessThan(0.05);
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('lerpAngle', () => {
  it('takes the short way around', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngle(90, 180, 0.25)).toBeCloseTo(112.5, 9);
    expect(normDeg(lerpAngle(0, 0, 0.5))).toBe(0);
  });
});

describe('poseFromOrientation', () => {
  it('passes iOS compass heading through', () => {
    const p = poseFromOrientation({
      alpha: null, beta: 90, gamma: 0, absolute: false,
      webkitCompassHeading: 123, webkitCompassAccuracy: 8, screenAngle: 0,
    });
    expect(p.heading).toBeCloseTo(123, 9);
    expect(p.headingAcc).toBe(8);
    expect(p.elev).toBeCloseTo(0, 9); // upright phone looks at horizon
  });

  it('maps absolute Android alpha to heading, flat phone to zenith', () => {
    const p = poseFromOrientation({
      alpha: 300, beta: 0, gamma: 0, absolute: true, screenAngle: 0,
    });
    expect(p.heading).toBeCloseTo(60, 9);
    expect(p.elev).toBeCloseTo(90, 9);
  });

  it('returns nulls when nothing usable is present', () => {
    const p = poseFromOrientation({
      alpha: 100, beta: null, gamma: null, absolute: false, screenAngle: 0,
    });
    expect(p.heading).toBeNull();
    expect(p.elev).toBeNull();
  });
});

describe('radecFromPose', () => {
  it('resolves a pose to sky coords and honors calibration', () => {
    const date = new Date('2025-08-01T00:00:00Z');
    const site = { lat: 23.8, lon: 90.4 };
    const a = radecFromPose({ heading: 180, elev: 45, headingAcc: null }, site, date, 0);
    const b = radecFromPose({ heading: 180, elev: 45, headingAcc: null }, site, date, 10);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs((b!.ra - a!.ra + 540) % 360 - 180)).toBeGreaterThan(1);
    expect(radecFromPose({ heading: null, elev: 45, headingAcc: null }, site, date)).toBeNull();
  });
});
