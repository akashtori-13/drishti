import { describe, expect, it } from 'vitest';
import {
  glyphOf, killScore, layoutWave, marchSpeed, overlap, textWidth,
} from './invaders';

describe('layoutWave', () => {
  it('grows rows to 5 and fits columns to the field', () => {
    const w1 = layoutWave(1, 800);
    expect(w1.length).toBeGreaterThan(0);
    expect(w1.every((a) => a.alive)).toBe(true);
    const w5 = layoutWave(5, 800);
    expect(new Set(w5.map((a) => a.row)).size).toBe(5);
    const narrow = layoutWave(1, 100);
    expect(narrow.length).toBeLessThan(w1.length);
  });
});

describe('overlap', () => {
  it('detects AABB hits and misses', () => {
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 10, h: 10 })).toBe(false);
  });
});

describe('marchSpeed', () => {
  it('ramps with wave and accelerates as invaders fall', () => {
    const base = marchSpeed(1, 40, 40);
    expect(marchSpeed(3, 40, 40)).toBeGreaterThan(base);
    expect(marchSpeed(1, 4, 40)).toBeGreaterThan(base);
    expect(marchSpeed(1, 0, 0)).toBeGreaterThan(0);
  });
});

describe('killScore', () => {
  it('adds capped streak bonus', () => {
    expect(killScore(20, 0)).toBe(20);
    expect(killScore(20, 4)).toBe(40);
    expect(killScore(20, 100)).toBe(60);
  });
});

describe('pixel font', () => {
  it('measures and resolves glyphs', () => {
    expect(textWidth('ABC')).toBe(11);
    expect(textWidth('')).toBe(0);
    expect(glyphOf('A')).toHaveLength(5);
    expect(glyphOf('~')[0]).toBeDefined();
  });
});
