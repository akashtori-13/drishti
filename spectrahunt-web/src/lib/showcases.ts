// Showcase + cross-match client. Static-first: /showcases/*.json, no backend needed.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE || 'static';
export const useLive = Boolean(API_BASE) && DATA_MODE === 'live';

export interface ShowcaseEpoch {
  label: string;
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
}

export interface Showcase {
  id: string;
  title: string;
  ra: number;
  dec: number;
  story: string;
  epochs: ShowcaseEpoch[];
  tap?: { collection: string; bandpass: string; endpoint: string };
  links?: Record<string, string>;
  citation?: { doi: string; text: string };
}

export const SHOWCASE_IDS = ['3i-atlas', 'ecliptic-mover', 'nep-deep'] as const;

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const getShowcase = (id: string) => fetchJSON<Showcase>(`/showcases/${id}.json`);

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
