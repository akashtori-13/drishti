// Showcase + cross-match client. Static-first: /showcases/*.json, no backend needed.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
export { API_BASE };
const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE || 'static';
export const useLive = Boolean(API_BASE) && DATA_MODE === 'live';

export interface ShowcaseEpoch {
  label: string;
  name?: string;
  obs_id?: string;
  detector?: string;
  band?: number;
  wavelength_um?: number;
  mjd?: number;
  ra?: number;
  dec?: number;
  size_deg?: number;
  png?: string | null;
  cutout_url?: string;
  note?: string;
  skybot_match?: string | null;
}

export interface ShowcaseBand {
  png?: string | null;
  cutout_url?: string;
  mjd?: number;
  wavelength_um?: number;
}

export interface Showcase {
  id: string;
  title: string;
  ra: number;
  dec: number;
  story: string;
  epochs: ShowcaseEpoch[];
  bands?: Record<string, ShowcaseBand>;
  tap?: { collection: string; bandpass: string; endpoint: string };
  links?: Record<string, string>;
  citation?: { doi: string; text: string };
}

export const SHOWCASE_IDS = ['3i-atlas', 'ecliptic-mover', 'nep-deep', 'orion-field', 'galactic-center', 'm31-field', 'lmc-field', 'virgo-field', 'eros-field', 'crab-field', 'omega-cen-field', 'carina-field', 'm51-field', 'm101-field', 'smc-field', 'dorado-deep', 'draco-field', 'ophiuchus-field', 'libra-field', 'hercules-field'] as const;

export interface RealCell {
  showcase: string; ra: number; dec: number;
  images: number; images_capped: boolean;
  epochs: number; bands: number;
  span_mjd: [number, number] | null;
  per_band?: Record<string, number>;
}

export interface Coverage {
  grid: { w: number; h: number };
  cells: Record<string, RealCell>;
  generated_at: string;
  source: string;
}

import { peek, remember } from '@/lib/cachefirst';

async function fetchJSON<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

const COVERAGE_TTL = 3600 * 1000;

function ageOf(key: string): number {
  try {
    return Date.now() - Number(localStorage.getItem(`${key}:at`) || 0);
  } catch {
    return Infinity;
  }
}

function notifyRevalidated(key: string, data: unknown) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('sh-revalidate', { detail: { key, data } }));
    }
  } catch { /* noop */ }
}

/** Cache-first: device copy resolves instantly when present; refreshes behind. */
export async function getCoverage(): Promise<Coverage | null> {
  const key = 'sh-coverage';
  const cached = peek<Coverage>(key);
  const cachedJSON = cached ? JSON.stringify(cached) : null;
  const refresh = fetchJSON<Coverage>('/coverage.json')
    .then((c) => {
      remember(key, c);
      if (cachedJSON !== null && cachedJSON !== JSON.stringify(c)) notifyRevalidated(key, c);
      return c;
    })
    .catch((): Coverage | null => null);
  if (cached && ageOf(key) < COVERAGE_TTL) {
    void refresh;
    return cached;
  }
  if (cached) {
    void refresh;
    return cached;
  }
  return refresh;
}

/** Cache-first per showcase.
 *
 * Serves the device copy instantly when present and revalidates behind.
 * When the background refresh yields different JSON (e.g. newly indexed
 * cutout PNGs), a `sh-revalidate` window event fires with
 * `{ key: 'sh-showcase:<id>', data }` so the current view can swap in the
 * fresh data without requiring a manual reload. Previously the refresh was
 * discarded, so the first client-side visit after a data update rendered
 * stale `png:null` ("cutout pending" / "loading frame…") until a full reload.
 */
export async function getShowcase(id: string): Promise<Showcase> {
  const key = `sh-showcase:${id}`;
  const cached = peek<Showcase>(key);
  const cachedJSON = cached ? JSON.stringify(cached) : null;
  const refresh = fetchJSON<Showcase>(`/showcases/${id}.json`).then((d) => {
    remember(key, d);
    if (cachedJSON !== null && cachedJSON !== JSON.stringify(d)) notifyRevalidated(key, d);
    return d;
  });
  if (cached) {
    refresh.catch(() => undefined);
    return cached;
  }
  return refresh;
}

/** A blink needs a pair: at least two epochs with rendered PNGs. */
export function isBlinkable(s: Showcase | null | undefined): s is Showcase {
  if (!s || !Array.isArray(s.epochs)) return false;
  return s.epochs.filter((e) => !!e.png).length >= 2;
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Live-first probe: fresh JSON when reachable, device cache when offline. */
async function probeShowcase(id: string): Promise<Showcase | null> {
  try {
    const r = await fetch(`/showcases/${id}.json`);
    if (r.ok) {
      const d = (await r.json()) as Showcase;
      remember(`sh-showcase:${id}`, d);
      return d;
    }
  } catch { /* fall through to cache */ }
  try {
    return await getShowcase(id);
  } catch {
    return null;
  }
}

/**
 * Random blinkable showcase: walks a shuffled pool and returns the first
 * showcase whose epochs actually have rendered PNGs (pending/unreachable
 * fields are skipped, not shown). Returns null when nothing is reachable
 * (offline with an empty cache), so callers can fall back to a curated
 * sky target.
 */
export async function randomBlinkable(excludeId?: string | null): Promise<Showcase | null> {
  const pool = shuffled(SHOWCASE_IDS).filter((id) => id !== excludeId);
  for (const id of pool.length ? pool : [...SHOWCASE_IDS]) {
    const s = await probeShowcase(id);
    if (isBlinkable(s)) return s;
  }
  return null;
}

// ---------- live on-demand fields (any visited sky position, live API only) ----------
export const isLiveId = (id: string) => id.startsWith('live:');

export function liveIdFor(ra: number, dec: number, band = 3): string {
  return `live:${ra.toFixed(3)}:${dec.toFixed(3)}:${band}`;
}

export function parseLiveId(id: string): { ra: number; dec: number; band: number } | null {
  const m = id.match(/^live:(-?[\d.]+):(-?[\d.]+):(\d+)$/);
  if (!m) return null;
  const ra = parseFloat(m[1]);
  const dec = parseFloat(m[2]);
  const band = parseInt(m[3], 10);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;
  return { ra, dec, band: band >= 1 && band <= 6 ? band : 3 };
}

interface FramesResponse {
  epochs: Array<{ epoch: number; mjd?: number; bandpass?: string; png?: string }>;
  detail: string;
  count?: number;
}

export async function fetchLiveShowcase(ra: number, dec: number, band = 3): Promise<Showcase> {
  if (!useLive) throw new Error('Live fields need the dev API (DATA_MODE=live)');
  const r = await fetch(
    `${API_BASE}/api/frames?ra=${ra}&dec=${dec}&band=${band}&size_deg=0.15`);
  if (!r.ok) throw new Error(`frames HTTP ${r.status}`);
  const j = (await r.json()) as FramesResponse;
  if (!j.epochs.length) throw new Error(j.detail === 'need-2-epochs' ? 'Fewer than 2 SPHEREx visits here' : 'No IRSA coverage');
  const { mjdToDate } = await import('@/lib/astro');
  return {
    id: liveIdFor(ra, dec, band),
    title: `Field RA ${ra.toFixed(2)}°, Dec ${dec.toFixed(2)}° — live blink`,
    ra, dec,
    story: `${j.count ?? j.epochs.length} SPHEREx visits found at this position; blinking ${j.epochs.length} sampled same-band epochs fetched live from IRSA.`,
    epochs: j.epochs.map((e, i) => ({
      label: e.mjd ? `${mjdToDate(e.mjd)} · epoch ${e.epoch}` : `Epoch ${i + 1}`,
      band, mjd: e.mjd,
      png: e.png ? `${API_BASE}${e.png}` : null,
      note: e.bandpass ?? undefined,
    })),
    tap: { collection: 'spherex_qr2', bandpass: `SPHEREx-D${band}`, endpoint: 'https://irsa.ipac.caltech.edu/TAP' },
    links: { irsa_viewer: 'https://irsa.ipac.caltech.edu/irsaviewer/' },
    citation: { doi: '10.26131/IRSA652', text: 'SPHEREx QR2 via IRSA.' },
  };
}

export async function resolveQuery(query: string): Promise<{ ra: number; dec: number } | null> {
  if (useLive) {
    try {
      const r = await fetchJSON<{ ra: number | null; dec: number | null }>(
        `${API_BASE}/api/resolve?q=${encodeURIComponent(query)}`);
      if (r.ra != null && r.dec != null) return { ra: r.ra, dec: r.dec };
    } catch { /* local fallback */ }
  }
  const m = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const ra = parseFloat(m[1]);
  const dec = parseFloat(m[2]);
  if (Number.isNaN(ra) || Number.isNaN(dec) || ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;
  return { ra, dec };
}

export async function skybotMatches(ra: number, dec: number, mjd: number): Promise<Array<{ name: string }>> {
  if (!useLive) return [];
  try {
    const r = await fetchJSON<{ matches: Array<{ name: string }> }>(
      `${API_BASE}/api/skybot?ra=${ra}&dec=${dec}&mjd=${mjd}`);
    return r.matches ?? [];
  } catch {
    return [];
  }
}
