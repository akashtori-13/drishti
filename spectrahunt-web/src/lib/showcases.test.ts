import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlinkable, randomBlinkable, type Showcase } from './showcases';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return store;
}

const mk = (id: string, pngs: Array<string | null>): Showcase => ({
  id, title: id, ra: 10, dec: 20, story: '',
  epochs: pngs.map((png, i) => ({ label: `E${i + 1}`, png })),
});

const idOf = (url: unknown) => String(url).split('/').pop()?.replace('.json', '') ?? '';

beforeEach(() => {
  vi.unstubAllGlobals();
  stubStorage();
});

describe('isBlinkable', () => {
  it('needs two epochs with PNGs', () => {
    expect(isBlinkable(mk('a', ['/x.png', '/y.png']))).toBe(true);
    expect(isBlinkable(mk('b', ['/x.png', null]))).toBe(false);
    expect(isBlinkable(mk('c', []))).toBe(false);
    expect(isBlinkable(null)).toBe(false);
    expect(isBlinkable(undefined)).toBe(false);
  });
});

describe('randomBlinkable', () => {
  it('skips pending fields until a blinkable one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      const id = idOf(args[0]);
      const data = id === 'virgo-field' ? mk(id, ['/a.png', '/b.png']) : mk(id, [null, null]);
      return { ok: true, json: async () => data };
    }));
    const out = await randomBlinkable(null);
    expect(out?.id).toBe('virgo-field');
  });

  it('never re-rolls the blink we are standing on', async () => {
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      const id = idOf(args[0]);
      return { ok: true, json: async () => mk(id, ['/a.png', '/b.png']) };
    }));
    const out = await randomBlinkable('3i-atlas');
    expect(out).not.toBeNull();
    expect(out?.id).not.toBe('3i-atlas');
    expect(isBlinkable(out)).toBe(true);
  });

  it('returns null when nothing is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const out = await randomBlinkable(null);
    expect(out).toBeNull();
  });
});
