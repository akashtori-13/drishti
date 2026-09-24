import { describe, expect, it } from 'vitest';
import {
  approxBoresight,
  eciToGeo,
  epochDate,
  isDeepSpace,
  orthoProject,
  parseTLE,
  periodMin,
  prepareSwarm,
  propagate,
  subsolarPoint,
  sunDirectionECI,
  sunScreenAxis,
  telemetryFor,
  type SwarmBundle,
} from './orbit';

const SPHEREX_L1 = '1 63182U 25047E   26264.77495024  .00000602  00000-0  98630-4 0  9994';
const SPHEREX_L2 = '2 63182  97.9598  87.8476 0009123 239.8838 120.1467 14.74215449 82276';
const GOES_L1 = '1 29155U 06018A   26264.60171068  .00000037  00000-0  00000-0 0  9996';
const GOES_L2 = '2 29155   4.7762  75.1981 0059346 279.9887 115.2834 0.98785356 44203';
const MU = 398600.8;

function spherex() {
  const sat = parseTLE(SPHEREX_L1, SPHEREX_L2);
  if (!sat) throw new Error('SPHEREx TLE must parse');
  return sat;
}

describe('parseTLE', () => {
  it('reads SPHEREx elements', () => {
    const sat = spherex();
    expect(sat.satnum).toBe('63182');
    expect(sat.ecco).toBeCloseTo(0.0009123, 7);
    expect(sat.inclo).toBeCloseTo(97.9598 * (Math.PI / 180), 6);
    // SGP4 init converts TLE (Brouwer) motion to Kozai motion — small J2 shift
    expect(Math.abs(periodMin(sat) - 1440 / 14.74215449)).toBeLessThan(0.15);
    expect(sat.bstar).toBeCloseTo(0.9863e-4, 9);
  });
  it('rejects garbage', () => {
    expect(parseTLE('', '')).toBeNull();
    expect(parseTLE('nope', 'nope')).toBeNull();
    expect(parseTLE(SPHEREX_L1, GOES_L2)).toBeNull();
    expect(parseTLE(SPHEREX_L1, SPHEREX_L1)).toBeNull();
  });
});

describe('propagate', () => {
  it('puts SPHEREx ~700 km up at ~7.5 km/s', () => {
    const p = propagate(spherex(), 0);
    if (!p.ok) throw new Error('must propagate');
    const r = Math.hypot(p.r.x, p.r.y, p.r.z);
    const v = Math.hypot(p.v.x, p.v.y, p.v.z);
    expect(r).toBeGreaterThan(6378 + 550);
    expect(r).toBeLessThan(6378 + 850);
    expect(v).toBeGreaterThan(7.3);
    expect(v).toBeLessThan(7.7);
    // near-circular: vis-viva semi-major axis matches the TLE period
    const a = 1 / (2 / r - (v * v) / MU);
    expect(a).toBeCloseTo(7021, -2); // within 100 km
    // circular speed at that radius
    expect(v).toBeCloseTo(Math.sqrt(MU / r), -1);
  });
  it('moves ~450 km in the first minute', () => {
    const sat = spherex();
    const a = propagate(sat, 0);
    const b = propagate(sat, 1);
    if (!a.ok || !b.ok) throw new Error('must propagate');
    const d = Math.hypot(b.r.x - a.r.x, b.r.y - a.r.y, b.r.z - a.r.z);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(600);
  });
  it('closes the orbit after one period', () => {
    const sat = spherex();
    const a = propagate(sat, 0);
    const b = propagate(sat, periodMin(sat));
    if (!a.ok || !b.ok) throw new Error('must propagate');
    const d = Math.hypot(b.r.x - a.r.x, b.r.y - a.r.y, b.r.z - a.r.z);
    expect(d).toBeLessThan(150);
  });
  it('refuses deep-space honestly', () => {
    const goes = parseTLE(GOES_L1, GOES_L2);
    if (!goes) throw new Error('GOES TLE must parse');
    expect(isDeepSpace(goes)).toBe(true);
    expect(propagate(goes, 0)).toEqual({ ok: false, error: 'deep-space' });
  });
});

describe('ground + sun math', () => {
  it('sub-point is sane at epoch', () => {
    const sat = spherex();
    const p = propagate(sat, 0);
    if (!p.ok) throw new Error('must propagate');
    const g = eciToGeo(p.r, sat.jdsatepoch);
    expect(g.lat).toBeGreaterThanOrEqual(-90);
    expect(g.lat).toBeLessThanOrEqual(90);
    expect(g.lon).toBeGreaterThanOrEqual(-180);
    expect(g.lon).toBeLessThanOrEqual(180);
    expect(g.altKm).toBeGreaterThan(550);
    expect(g.altKm).toBeLessThan(850);
  });
  it('sun stays in the ecliptic band', () => {
    const s = sunDirectionECI(2460645.5);
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
    const sub = subsolarPoint(2460645.5);
    expect(Math.abs(sub.lat)).toBeLessThan(23.6);
  });
  it('boresight proxy is a labeled unit direction', () => {
    const p = propagate(spherex(), 10);
    if (!p.ok) throw new Error('must propagate');
    const b = approxBoresight(p.r, p.v);
    expect(b.approx).toBe(true);
    expect(b.ra).toBeGreaterThanOrEqual(0);
    expect(b.ra).toBeLessThan(360);
    expect(b.dec).toBeGreaterThanOrEqual(-90);
    expect(b.dec).toBeLessThanOrEqual(90);
  });
});

describe('orthographic projection', () => {
  const view = { latC: 12, lonC: 88 };
  it('centers the sub-camera point', () => {
    const p = orthoProject(12, 88, 0, view);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.visible).toBe(true);
  });
  it('hides the antipode, keeps the limb', () => {
    expect(orthoProject(-12, 88 - 180, 0, view).visible).toBe(false);
    const limb = orthoProject(0, 90, 0, { latC: 0, lonC: 0 });
    expect(limb.visible).toBe(true);
    expect(Math.hypot(limb.x, limb.y)).toBeCloseTo(1, 6);
  });
  it('points east right and north up', () => {
    expect(orthoProject(12, 89, 0, view).x).toBeGreaterThan(0);
    expect(orthoProject(13, 88, 0, view).y).toBeGreaterThan(0);
  });
  it('lifts orbiters off the surface', () => {
    const p = orthoProject(12, 88, 700, view);
    expect(p.visible).toBe(true);
    expect(p.depth).toBeCloseTo((6378.135 + 700) / 6378.135, 6);
  });
  it('survives a near-pole camera', () => {
    const p = orthoProject(80, 0, 500, { latC: 89.9, lonC: 0 });
    expect([p.x, p.y, p.depth].every(Number.isFinite)).toBe(true);
  });
  it('sun axis is a finite unit direction', () => {
    const s = sunScreenAxis(2460645.5, view);
    expect(Math.hypot(s.ax, s.ay)).toBeCloseTo(1, 9);
    expect(Math.abs(s.depth)).toBeLessThanOrEqual(1);
  });
});

describe('swarm helpers', () => {
  const bundle: SwarmBundle = {
    source: 'test',
    fetched_at: '2026-09-22',
    objects: [
      { name: 'SPHEREX', norad: 63182, hero: true, l1: SPHEREX_L1, l2: SPHEREX_L2 },
      { name: 'GOES 13', norad: 29155, l1: GOES_L1, l2: GOES_L2 },
    ],
  };
  it('drops GEO from the render set', () => {
    const sats = prepareSwarm(bundle);
    expect(sats).toHaveLength(1);
    expect(sats[0].obj.hero).toBe(true);
  });
  it('telemetry is honest at epoch', () => {
    const sats = prepareSwarm(bundle);
    const ep = epochDate(sats[0].sat);
    const t = telemetryFor(sats[0], ep, ep);
    if (!t) throw new Error('must produce telemetry');
    expect(t.name).toBe('SPHEREX');
    expect(t.altKm).toBeGreaterThan(550);
    expect(t.velKmS).toBeGreaterThan(7.3);
    expect(t.incDeg).toBeCloseTo(97.96, 1);
    expect(Math.abs(t.tleAgeDays)).toBeLessThan(0.01);
    expect(t.boresight?.approx).toBe(true);
  });
});
