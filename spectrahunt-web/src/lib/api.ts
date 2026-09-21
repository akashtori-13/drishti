// API layer for SpectraHunt - live backend with static-JSON fallback.
// Static files are served from /data/* (spectrahunt-web/public/data/*).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE || 'static';
const useLive = Boolean(API_BASE) && DATA_MODE === 'live';

interface Status {
  release: string;
  last_ingest_at: string | null;
  newest_planning_period: string | null;
  frames_indexed: number;
  fields_indexed: number;
  candidates_this_week: number;
  pipeline_version: string;
}

export type { Status };

interface Coverage {
  grid: { w: number; h: number };
  counts: number[][];
  indexed: boolean[][];
  generated_at: string;
}

export type { Coverage };

interface Candidate {
  id: string;
  name: string;
  ra: number;
  dec: number;
  band: number;
  epoch_a: string;
  epoch_b: string;
  mjd_a: number;
  mjd_b: number;
  significance_sigma: number;
  motion_arcsec: number;
  motion_pa_deg: number;
  skybot_match: string | null;
  status: 'pending' | 'verified' | 'artifact' | 'unreviewed' | 'real';
  thumb_urls?: string[];
  created_at: string;
}

export type { Candidate };

interface FieldEpoch {
  epoch_id: string;
  planning_period: string;
  mjd: number;
  utc: string;
  frames: Array<{
    frame_id: string;
    band: number;
    detector: number;
    survey: 'wide' | 'deep';
    obs_id: string;
    wavelength_um_at_pos: number;
    bandwidth_um_at_pos: number;
    access_url: string;
    s3_key: string;
  }>;
}

interface Field {
  ra: number;
  dec: number;
  epochs: FieldEpoch[];
  bands_present: number[];
  survey: 'wide' | 'deep';
}

interface BlinkFrame {
  epoch_label: string;
  obs_id: string;
  utc: string;
  mjd: number;
  wavelength_um: number;
  png_url: string;
  fits_url: string;
  pixel_scale_arcsec: number;
}

interface BlinkData {
  frames: BlinkFrame[];
  diff_frames: Array<{
    from: string;
    to: string;
    png_url: string;
  }>;
  wcs_note: string;
}

interface SearchSuggestion {
  type: 'candidate' | 'object' | 'field' | 'coordinates';
  label: string;
  ra?: number;
  dec?: number;
  description?: string;
}

interface ResolveResult {
  name: string;
  ra: number;
  dec: number;
  type: 'solar_system' | 'fixed' | 'coordinate';
  ephemeris?: Array<{ mjd: number; ra: number; dec: number }>;
}

// In-memory cache
const cache = new Map<string, any>();

function normalizeCandidate(c: Candidate): Candidate {
  return {
    ...c,
    id: String((c as any).id ?? (c as any).name ?? ''),
    thumb_urls: Array.isArray((c as any).thumb_urls) ? (c as any).thumb_urls : [],
    skybot_match: (c as any).skybot_match ?? null,
  };
}

async function fetchJSON<T>(url: string, useCache = true): Promise<T> {
  const cacheKey = url;
  
  if (useCache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type { Field, BlinkData, SearchSuggestion, ResolveResult };

export async function getStatus(): Promise<Status> {
  if (useLive) {
    try {
      return await fetchJSON<Status>(`${API_BASE}/api/status`);
    } catch {
      // fall through to static
    }
  }
  return await fetchJSON<Status>('/data/status.json');
}

export async function getCoverage(): Promise<Coverage> {
  if (useLive) {
    try {
      return await fetchJSON<Coverage>(`${API_BASE}/api/coverage`);
    } catch {
      // fall through to static
    }
  }
  return await fetchJSON<Coverage>('/data/coverage.json');
}

export async function getCandidates(params?: {
  since?: string;
  band?: number;
  status?: string;
  limit?: number;
}): Promise<Candidate[]> {
  const queryParams = new URLSearchParams();
  if (params?.since) queryParams.append('since', params.since);
  if (params?.band) queryParams.append('band', params.band.toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  const query = queryParams.toString();
  const url = `${API_BASE}/api/candidates${query ? `?${query}` : ''}`;

  if (useLive) {
    try {
      const rows = await fetchJSON<Candidate[]>(url);
      return rows.map(normalizeCandidate);
    } catch {
      // fall through to static
    }
  }
  const rows = await fetchJSON<Candidate[]>('/data/candidates.json');
  return rows.map(normalizeCandidate);
}

export async function getField(ra: number, dec: number): Promise<Field> {
  if (useLive) {
    try {
      return await fetchJSON<Field>(`${API_BASE}/api/field?ra=${ra}&dec=${dec}`);
    } catch {
      // fall through to demo fields
    }
  }
  // demo_fields.json is an array of {name, ra, dec, ...}; synthesize a Field
  const demo = await fetchJSON<Array<{ name?: string; ra: number; dec: number }>>('/data/demo_fields.json');
  let best: { name?: string; ra: number; dec: number } | null = null;
  let bestDist = Infinity;
  for (const f of demo) {
    const dist = Math.hypot(f.ra - ra, f.dec - dec);
    if (dist < bestDist) { bestDist = dist; best = f; }
  }
  if (best && bestDist < 5) {
    return { ra: best.ra, dec: best.dec, epochs: [], bands_present: [], survey: 'wide' };
  }
  throw new Error('No data available for this location');
}

export async function getBlink(ra: number, dec: number, band: number, sizeArcmin: number = 10): Promise<BlinkData> {
  if (!useLive) {
    throw new Error('No blink data available - insufficient epochs or wavelength mismatch');
  }
  const url = `${API_BASE}/api/blink?ra=${ra}&dec=${dec}&band=${band}&size_arcmin=${sizeArcmin}`;

  try {
    return await fetchJSON<BlinkData>(url);
  } catch {
    throw new Error('No blink data available - insufficient epochs or wavelength mismatch');
  }
}

export async function resolve(query: string): Promise<ResolveResult | null> {
  if (useLive) {
    try {
      return await fetchJSON<ResolveResult | null>(`${API_BASE}/api/resolve?q=${encodeURIComponent(query)}`);
    } catch {
      // fall through to local coordinate parsing
    }
  }
  // Try coordinate parsing
  const match = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (match) {
    const ra = parseFloat(match[1]);
    const dec = parseFloat(match[2]);

    if (!isNaN(ra) && !isNaN(dec) && ra >= -180 && ra <= 180 && dec >= -90 && dec <= 90) {
      return {
        name: query,
        ra,
        dec,
        type: 'coordinate'
      };
    }
  }

  return null;
}

export async function getSuggestions(query: string): Promise<SearchSuggestion[]> {
  const suggestions: SearchSuggestion[] = [];
  
  // Get recent candidates
  try {
    const candidates = await getCandidates({ limit: 5 });
    suggestions.push(...candidates.map(c => ({
      type: 'candidate' as const,
      label: c.name,
      ra: c.ra,
      dec: c.dec,
      description: `Band ${c.band}, σ=${c.significance_sigma.toFixed(1)}`
    })));
  } catch {
    // Ignore if no candidates
  }
  
  // Add coordinate suggestion if valid
  const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const ra = parseFloat(coordMatch[1]);
    const dec = parseFloat(coordMatch[2]);
    
    if (!isNaN(ra) && !isNaN(dec)) {
      suggestions.push({
        type: 'coordinates',
        label: query,
        ra,
        dec,
        description: 'Search by coordinates'
      });
    }
  }
  
  return suggestions.slice(0, 8);
}

export async function getSkybot(ra: number, dec: number, mjd: number, radiusArcsec: number = 10) {
  if (!useLive) return { matches: [] };
  const url = `${API_BASE}/api/skybot?ra=${ra}&dec=${dec}&mjd=${mjd}&radius_arcsec=${radiusArcsec}`;
  
  try {
    return await fetchJSON<any>(url);
  } catch {
    return { matches: [] };
  }
}

export function clearCache() {
  cache.clear();
}
