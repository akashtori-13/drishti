import { describe, expect, it } from 'vitest';
import {
  drawPixelText, drawPixelTextC, drawSprite, glyphOf, killScore, layoutWave, marchSpeed, overlap, textWidth,
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

describe('bitmap renderer', () => {
  function mockCtx() {
    const rects: Array<[number, number, number, number]> = [];
    const ctx = {
      fillStyle: '',
      fillRect: (x: number, y: number, w: number, h: number) => { rects.push([x, y, w, h]); },
    };
    return { ctx, rects };
  }
  const asCtx = (c: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void }) =>
    c as unknown as CanvasRenderingContext2D;

  it('paints only ink cells, never empty font cells', () => {
    // A has exactly 10 ink cells; space and dots paint nothing.
    const { ctx, rects } = mockCtx();
    expect(drawPixelText(asCtx(ctx), 'A', 0, 0, 1, '#fff')).toBe(3);
    expect(rects).toHaveLength(10);
    const { ctx: ctx2, rects: rects2 } = mockCtx();
    drawPixelText(asCtx(ctx2), '  ', 0, 0, 2, '#fff');
    expect(rects2).toHaveLength(0);
  });

  it('never renders a glyph as a solid block', () => {
    // Regression: the renderer once skipped only ' ', but empty font cells
    // are '.', so every glyph painted as a 3x5 brick.
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.!?-+ ';
    for (const ch of glyphs) {
      const { ctx, rects } = mockCtx();
      drawPixelText(asCtx(ctx), ch, 0, 0, 1, '#fff');
      const ink = glyphOf(ch).join('').replace(/[ .]/g, '').length;
      expect(rects.length).toBe(ink);
      expect(rects.length).toBeLessThan(15);
    }
  });

  it('centers text on the given x', () => {
    const { ctx, rects } = mockCtx();
    drawPixelTextC(asCtx(ctx), 'A', 100, 0, 2, '#fff');
    // first ink cell of A (row '.X.', scale 2): 100 - (3*2)/2 + 1*2
    expect(rects).toHaveLength(10);
    expect(rects[0][0]).toBe(99);
  });

  it('drawSprite skips empty sprite cells', () => {
    const { ctx, rects } = mockCtx();
    drawSprite(asCtx(ctx), ['X.', '.X'], 0, 0, '#fff');
    expect(rects).toHaveLength(2);
  });
});
