import { beforeEach, describe, expect, it, vi } from 'vitest';
import { peek, remember, swr } from './cachefirst';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return store;
}

beforeEach(() => {
  stubStorage();
  vi.unstubAllGlobals();
  stubStorage();
});

describe('peek/remember', () => {
  it('round-trips JSON', () => {
    expect(peek('k')).toBeNull();
    remember('k', { a: 1 });
    expect(peek<{ a: number }>('k')).toEqual({ a: 1 });
  });
});

describe('swr', () => {
  it('awaits network when cache is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ v: 1 }) })));
    const out = await swr<{ v: number }>('k', '/x.json', 1000);
    expect(out).toEqual({ data: { v: 1 }, stale: false });
  });

  it('serves cache instantly when offline', async () => {
    remember('k', { v: 2 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const out = await swr<{ v: number }>('k', '/x.json', 1000);
    // young cache: instant, refresh attempted in background
    expect(out?.data).toEqual({ v: 2 });
  });

  it('resolves null when offline with empty cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const out = await swr('k', '/x.json', 1000);
    expect(out).toBeNull();
  });
});
