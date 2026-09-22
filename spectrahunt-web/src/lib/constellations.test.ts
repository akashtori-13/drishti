import { describe, expect, it } from 'vitest';
import { FIGURES, initialPlay, nodeAt, scoreLine, tapNode } from './constellations';

describe('tapNode', () => {
  it('advances in order with streak bonus and completes figures', () => {
    let s = initialPlay();
    const fig = FIGURES[0];
    for (let i = 0; i < fig.nodes.length; i++) {
      const before = s;
      const r = tapNode(s, i);
      s = r.state;
      expect(r.result.kind).toBe('hit');
      if (i < fig.nodes.length - 1) {
        expect(r.result).toMatchObject({ complete: false });
        expect(s.hitIdx).toBe(before.hitIdx + 1);
        expect(s.streak).toBe(before.streak + 1);
      } else {
        expect(r.result).toMatchObject({ complete: true });
        expect(s.figureIdx).toBe(1);
        expect(s.hitIdx).toBe(0);
        expect(s.done).toBe(1);
      }
    }
    // 7 nodes: gained = 100 + streak*25 for streak 0..6 → 700 + 25*21 = 1225
    expect(s.score).toBe(1225);
  });

  it('penalizes misses and out-of-order taps, forgives repeats', () => {
    let s = { ...initialPlay(), score: 200 };
    let r = tapNode(s, 3); // future node first: miss
    expect(r.result.kind).toBe('miss');
    expect(r.state.score).toBe(175);
    expect(r.state.streak).toBe(0);
    s = r.state;
    r = tapNode(s, 0); // correct start
    expect(r.result.kind).toBe('hit');
    s = r.state;
    r = tapNode(s, 0); // already visited
    expect(r.result.kind).toBe('repeat');
    expect(r.state.score).toBe(s.score);
    r = tapNode(s, -1); // empty sky
    expect(r.result.kind).toBe('miss');
  });

  it('never drops the score below zero', () => {
    const r = tapNode(initialPlay(), 4);
    expect(r.state.score).toBe(0);
  });
});

describe('nodeAt', () => {
  it('finds the nearest node within radius', () => {
    const fig = FIGURES[1]; // cassiopeia
    expect(nodeAt(fig, 0.12, 0.62)).toBe(0);
    expect(nodeAt(fig, 0.5, 0.5)).toBe(2);
    expect(nodeAt(fig, 0.9, 0.9)).toBe(-1);
  });
});

describe('scoreLine', () => {
  it('formats HUD text', () => {
    expect(scoreLine({ ...initialPlay(), score: 325, done: 2 })).toBe('325 pts · 2 drawn');
  });
});

describe('figures', () => {
  it('all have ≥4 nodes, names, and facts', () => {
    expect(FIGURES.length).toBeGreaterThanOrEqual(4);
    for (const f of FIGURES) {
      expect(f.nodes.length).toBeGreaterThanOrEqual(4);
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.fact.length).toBeGreaterThan(0);
    }
  });
});
