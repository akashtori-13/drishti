import { describe, expect, it } from 'vitest';
import { assignTrackIds, buildTracks, detectMotion, sampleGrayAt } from './motion';

function grid(w: number, h: number, fill: (x: number, y: number) => number) {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fill(x, y);
  return { data, w, h };
}

describe('sampleGrayAt', () => {
  it('reads normalized coords clamped to the grid', () => {
    const g = grid(4, 4, (x, y) => (y * 4 + x) / 15);
    expect(sampleGrayAt(g, 0, 0)).toBeCloseTo(0);
    expect(sampleGrayAt(g, 1, 1)).toBeCloseTo(1);
    expect(sampleGrayAt(g, 9, -9)).toBeCloseTo(g.data[3]);
  });
});

describe('detectMotion smoke', () => {
  it('finds a bright peak pair as a mover', () => {
    const dark = grid(32, 32, () => 0.1);
    const mk = (bx: number, by: number) => {
      const data = new Float32Array(dark.data);
      data[by * 32 + bx] = 0.9;
      return { data, w: 32, h: 32 };
    };
    const out = detectMotion(mk(10, 10), mk(16, 10));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].kind).toBe('mover');
  });
});

describe('assignTrackIds', () => {  it('keeps identity for stationary and predicted movers', () => {
    const prev = [
      { x: 0.2, y: 0.2, dx: 0, dy: 0, n: 1 },
      { x: 0.5, y: 0.5, dx: 0.04, dy: 0, n: 2 },
    ];
    const cur = [
      { x: 0.205, y: 0.2, dx: 0, dy: 0, kind: 'variable' },
      { x: 0.545, y: 0.5, dx: 0.04, dy: 0, kind: 'mover' },
    ];
    const r = assignTrackIds(prev, cur, 3);
    expect(r.ids).toEqual([1, 2]);
    expect(r.next).toBe(3);
  });

  it('mints new numbers for far objects', () => {
    const r = assignTrackIds(
      [{ x: 0.1, y: 0.1, dx: 0, dy: 0, n: 1 }],
      [{ x: 0.9, y: 0.9, dx: 0, dy: 0, kind: 'variable' }],
      2,
    );
    expect(r.ids).toEqual([2]);
    expect(r.next).toBe(3);
  });
});

describe('buildTracks', () => {
  const mk = (n: number, kind: 'mover' | 'variable', x: number, y: number, sigma = 10) => ({
    x, y, dx: 0.02, dy: 0, kind, sigma, n, ba: 0.4, bb: 0.5,
  });
  it('chains numbered detections into ordered full paths', () => {
    const tracks = buildTracks([
      [mk(1, 'mover', 0.2, 0.2), mk(2, 'variable', 0.7, 0.7)],
      [mk(1, 'mover', 0.25, 0.22)],
      [],
      [mk(2, 'variable', 0.71, 0.69), mk(3, 'mover', 0.1, 0.8)],
    ]);
    expect(tracks.map((t) => t.n)).toEqual([1, 2, 3]);
    expect(tracks[0].points).toEqual([
      { epoch: 0, x: 0.2, y: 0.2 },
      { epoch: 1, x: 0.25, y: 0.22 },
    ]);
    expect(tracks[1].points.map((p) => p.epoch)).toEqual([0, 3]);
    expect(tracks[2].kind).toBe('mover');
  });

  it('ignores unnumbered detections', () => {
    expect(buildTracks([[mk(0, 'variable', 0.5, 0.5)]])).toEqual([]);
  });
});
