import { describe, expect, it } from 'vitest';
import {
  applyStretch,
  arcsecPerDay,
  CHANNELS,
  channelsOfDetector,
  colormap,
  decodeView,
  encodeView,
  findConstellation,
  normalize,
  parseCoordinates,
  toCSV,
} from './astro';

describe('parseCoordinates', () => {
  it('parses decimal pairs', () => {
    expect(parseCoordinates('180, 0')).toEqual({ ra: 180, dec: 0 });
    const p = parseCoordinates('252.6633 -17.4904');
    expect(p?.ra).toBeCloseTo(252.6633, 6);
    expect(p?.dec).toBeCloseTo(-17.4904, 6);
  });
  it('parses sexagesimal', () => {
    const hms = parseCoordinates('10h12m30s +12d30m00s');
    expect(hms?.ra).toBeCloseTo(153.125, 2);
    expect(hms?.dec).toBeCloseTo(12.5, 2);
    const colon = parseCoordinates('10:12:30 +12:30:00');
    expect(colon?.ra).toBeCloseTo(153.125, 2);
  });
  it('rejects bad declinations, wraps RA', () => {
    expect(parseCoordinates('400, 0')?.ra).toBeCloseTo(40, 6);
    expect(parseCoordinates('10, 95')).toBeNull();
    expect(parseCoordinates('M31')).toBeNull();
  });
});

describe('constellations', () => {
  it('finds by name and abbreviation', () => {
    expect(findConstellation('Orion')?.abbr).toBe('Ori');
    expect(findConstellation('ori')?.name).toBe('Orion');
    expect(findConstellation('Nope')).toBeNull();
  });
});

describe('channels', () => {
  it('has 102 channels across 6 detectors', () => {
    expect(CHANNELS).toHaveLength(102);
    expect(channelsOfDetector(3)).toHaveLength(17);
    expect(channelsOfDetector(3)[0].wave_um).toBeGreaterThanOrEqual(1.63);
  });
});

describe('stretch + colormap', () => {
  it('applyStretch is monotonic in [0,1]', () => {
    for (const s of ['linear', 'log', 'sqrt', 'asinh'] as const) {
      expect(applyStretch(0, s)).toBeCloseTo(0, 6);
      expect(applyStretch(1, s)).toBeCloseTo(1, 6);
      expect(applyStretch(0.5, s)).toBeGreaterThan(0);
      expect(applyStretch(0.5, s)).toBeLessThan(1);
    }
  });
  it('normalize clamps, stretches, inverts', () => {
    expect(normalize(5, 0, 10, 'linear', false)).toBeCloseTo(0.5);
    expect(normalize(-5, 0, 10, 'linear', false)).toBe(0);
    expect(normalize(50, 0, 10, 'linear', false)).toBe(1);
    expect(normalize(5, 0, 10, 'linear', true)).toBeCloseTo(0.5);
    expect(normalize(0, 0, 10, 'linear', true)).toBe(1);
  });
  it('colormap returns bytes', () => {
    for (const cm of ['grayscale', 'viridis', 'inferno', 'cividis'] as const) {
      const [r, g, b] = colormap(0.5, cm);
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
    expect(colormap(0, 'grayscale')).toEqual([0, 0, 0]);
    expect(colormap(1, 'grayscale')).toEqual([255, 255, 255]);
  });
});

describe('motion math', () => {
  it('measures 60 arcsec/day for 1 arcmin drift', () => {
    expect(arcsecPerDay(0, 0, 1 / 60, 0, 1.0)).toBeCloseTo(60, 0);
  });
  it('rejects bad intervals', () => {
    expect(arcsecPerDay(0, 0, 0, 0, 0)).toBeNull();
    expect(arcsecPerDay(0, 0, 0, 0, -3)).toBeNull();
  });
});

describe('permalinks', () => {
  it('round-trips view state', () => {
    const s = { showcase: 'eros-field', ra: 210.32, dec: 9.11, band: 3, epoch: 1, mode: 'diff' };
    const h = encodeView(s);
    const back = decodeView(h);
    expect(back.showcase).toBe('eros-field');
    expect(back.band).toBe(3);
    expect(back.epoch).toBe(1);
  });
});

describe('toCSV', () => {
  it('escapes commas and quotes', () => {
    const csv = toCSV([{ a: 'x,y', b: 'q"q', c: 1 }]);
    expect(csv).toBe('a,b,c\n"x,y","q""q",1');
  });
});
