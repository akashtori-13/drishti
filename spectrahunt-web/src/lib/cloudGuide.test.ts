import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getCloudCfg, setCloudCfg, setCloudKey, clearCloudAll,
  getCloudOptIn, setCloudOptIn, keyLast4, askCloud, CLOUD_SYSTEM,
} from '@/lib/cloudGuide';

function memStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    get length() { return mem.size; },
    key: (i: number) => [...mem.keys()][i] ?? null,
  } as Storage;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', memStorage());
});

describe('cloud config', () => {
  it('defaults with no key', () => {
    expect(getCloudCfg()).toEqual({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: false });
    expect(getCloudOptIn()).toBe(false);
    expect(keyLast4()).toBe('');
  });
  it('round-trips url/model/key presence', () => {
    setCloudCfg('https://x.test/v1', 'm1');
    setCloudKey('sk-abcdef1234');
    expect(getCloudCfg()).toEqual({ baseUrl: 'https://x.test/v1', model: 'm1', hasKey: true });
    expect(keyLast4()).toBe('••••1234');
    setCloudOptIn(true);
    expect(getCloudOptIn()).toBe(true);
  });
  it('clear wipes everything', () => {
    setCloudKey('sk-abcdef1234');
    setCloudOptIn(true);
    clearCloudAll();
    expect(getCloudCfg().hasKey).toBe(false);
    expect(getCloudOptIn()).toBe(false);
  });
  it('system prompt forbids discovery claims', () => {
    expect(CLOUD_SYSTEM).toMatch(/consistent-static/);
    expect(CLOUD_SYSTEM).toMatch(/WITHDRAWN/);
    expect(CLOUD_SYSTEM).toMatch(/10\.26131\/IRSA652/);
  });
});

describe('askCloud', () => {
  it('throws with no key (caller falls back local)', async () => {
    await expect(askCloud('hi', { route: '/', fieldId: null, fieldTitle: null, epochs: 0, bands: [], compareMode: 'blink' })).rejects.toThrow('no key');
  });
  it('posts grounded context, parses reply', async () => {
    setCloudKey('sk-test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '  Hello  ' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await askCloud('hi', { route: '/blink/orion-field', fieldId: 'orion-field', fieldTitle: 'Orion', epochs: 7, bands: [3], compareMode: 'blink' });
    expect(out).toBe('Hello');
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(opts.body as string) as { messages: Array<{ content: string }> };
    expect(body.messages[1].content).toMatch(/orion-field/);
    expect(body.messages[0].content).toMatch(/consistent-static/);
  });
  it('throws on HTTP error and empty reply', async () => {
    setCloudKey('sk-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(askCloud('hi', { route: '/', fieldId: null, fieldTitle: null, epochs: 0, bands: [], compareMode: 'blink' })).rejects.toThrow('401');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ choices: [] }) }));
    await expect(askCloud('hi', { route: '/', fieldId: null, fieldTitle: null, epochs: 0, bands: [], compareMode: 'blink' })).rejects.toThrow('empty');
  });
});
