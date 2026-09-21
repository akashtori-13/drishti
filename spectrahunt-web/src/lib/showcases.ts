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

export const SHOWCASE_IDS = ['3i-atlas', 'ecliptic-mover', 'nep-deep', 'orion-field', 'galactic-center', 'm31-field', 'lmc-field', 'virgo-field', 'eros-field', 'crab-field', 'omega-cen-field', 'carina-field', 'm51-field', 'm101-field', 'smc-field'] as const;

export interface RealCell {
  showcase: string; ra: number; dec: number;
  images: number; images_capped: boolean;
  epochs: number; bands: number;
  span_mjd: [number, number] | null;
  per_band: Record<string, number>;
}

export interface Coverage {
  grid: { w: number; h: number };
  cells: Record<string, RealCell>;
  generated_at: string;
  source: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const getCoverage = () => fetchJSON<Coverage>('/coverage.json').catch((): Coverage | null => null);

export const getShowcase = (id: string) => fetchJSON<Showcase>(`/showcases/${id}.json`);

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
