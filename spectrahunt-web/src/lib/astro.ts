// Shared astronomy math: coordinates, channels, stretch, colormaps, permalinks.
// Pure functions only — unit-tested in backend/tests + `npm run build` typecheck.

export interface RaDec { ra: number; dec: number }

// ---------- coordinate parsing (degrees, sexagesimal, SIMBAD-ish) ----------
export function parseHMS(h: number, m: number, s: number): number {
  return ((h % 24) + m / 60 + s / 3600) * 15;
}

export function parseDMS(sign: number, d: number, m: number, s: number): number {
  return sign * (Math.abs(d) + m / 60 + s / 3600);
}

/** Parse "132.4, -3.2" | "10h12m30s +12d30m00s" | "10:12:30 +12:30:00" | "252.6633 -17.4904" */
export function parseCoordinates(input: string): RaDec | null {
  const q = input.trim().replace(/,/g, ' ');
  // plain decimal pair
  let m = q.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const ra = parseFloat(m[1]);
    const dec = parseFloat(m[2]);
    // allow RA in hours when <24 and second value looks like dec with explicit sign
    if (ra >= 0 && ra < 24 && /[+-]/.test(m[2])) {
      return normRaDec(ra * 15, dec);
    }
    return normRaDec(ra, dec);
  }
  // hms/dms with letters
  m = q.match(/(\d+(?:\.\d+)?)\s*h\s*(\d+(?:\.\d+)?)?\s*m?\s*(\d+(?:\.\d+)?)?\s*s?\s*([+-])\s*(\d+(?:\.\d+)?)\s*d?\s*(\d+(?:\.\d+)?)?\s*m?\s*(\d+(?:\.\d+)?)?\s*s?/i);
  if (m) {
    const ra = parseHMS(parseFloat(m[1]), parseFloat(m[2] || '0'), parseFloat(m[3] || '0'));
    const sign = m[4] === '-' ? -1 : 1;
    const dec = parseDMS(sign, parseFloat(m[5]), parseFloat(m[6] || '0'), parseFloat(m[7] || '0'));
    return normRaDec(ra, dec);
  }
  // colon form "10:12:30 +12:30:00"
  m = q.match(/(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\s+([+-]?\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?/);
  if (m) {
    const ra = parseHMS(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3] || '0'));
    const dRaw = parseFloat(m[4]);
    const sign = dRaw < 0 || q.includes(' -') || /-\d/.test(m[4]) ? -1 : (m[4].startsWith('-') ? -1 : 1);
    const dec = parseDMS(sign, dRaw, parseFloat(m[5]), parseFloat(m[6] || '0'));
    return normRaDec(ra, dec);
  }
  return null;
}

export function normRaDec(ra: number, dec: number): RaDec | null {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  ra = ((ra % 360) + 360) % 360;
  if (dec < -90 || dec > 90) return null;
  return { ra, dec };
}

export function formatHMS(ra: number): string {
  const h = ra / 15;
  const H = Math.floor(h);
  const M = Math.floor((h - H) * 60);
  const S = ((h - H) * 60 - M) * 60;
  return `${H}h ${M}m ${S.toFixed(1)}s`;
}

export function formatDMS(dec: number): string {
  const s = dec < 0 ? '-' : '+';
  const a = Math.abs(dec);
  const D = Math.floor(a);
  const M = Math.floor((a - D) * 60);
  const S = ((a - D) * 60 - M) * 60;
  return `${s}${D}° ${M}′ ${S.toFixed(1)}″`;
}

// ---------- constellations (IAU 88, J2000 centers, abbreviated list) ----------
export interface Constellation { abbr: string; name: string; ra: number; dec: number }
export const CONSTELLATIONS: Constellation[] = [
  { abbr: 'And', name: 'Andromeda', ra: 12.5, dec: 38 },
  { abbr: 'Aqr', name: 'Aquarius', ra: 335, dec: -11 },
  { abbr: 'Aql', name: 'Aquila', ra: 297, dec: 5 },
  { abbr: 'Ara', name: 'Ara', ra: 257, dec: -53 },
  { abbr: 'Ari', name: 'Aries', ra: 35, dec: 18 },
  { abbr: 'Aur', name: 'Auriga', ra: 90, dec: 40 },
  { abbr: 'Boo', name: 'Boötes', ra: 225, dec: 30 },
  { abbr: 'CMa', name: 'Canis Major', ra: 105, dec: -22 },
  { abbr: 'CMi', name: 'Canis Minor', ra: 115, dec: 8 },
  { abbr: 'Cap', name: 'Capricornus', ra: 315, dec: -18 },
  { abbr: 'Car', name: 'Carina', ra: 115, dec: -62 },
  { abbr: 'Cas', name: 'Cassiopeia', ra: 15, dec: 62 },
  { abbr: 'Cen', name: 'Centaurus', ra: 195, dec: -48 },
  { abbr: 'Cep', name: 'Cepheus', ra: 330, dec: 65 },
  { abbr: 'Cet', name: 'Cetus', ra: 25, dec: -10 },
  { abbr: 'Cyg', name: 'Cygnus', ra: 310, dec: 42 },
  { abbr: 'Dra', name: 'Draco', ra: 260, dec: 65 },
  { abbr: 'Eri', name: 'Eridanus', ra: 60, dec: -20 },
  { abbr: 'Gem', name: 'Gemini', ra: 110, dec: 22 },
  { abbr: 'Her', name: 'Hercules', ra: 255, dec: 32 },
  { abbr: 'Hya', name: 'Hydra', ra: 160, dec: -15 },
  { abbr: 'Leo', name: 'Leo', ra: 155, dec: 15 },
  { abbr: 'Lib', name: 'Libra', ra: 232, dec: -15 },
  { abbr: 'Lyr', name: 'Lyra', ra: 283, dec: 37 },
  { abbr: 'Oph', name: 'Ophiuchus', ra: 262, dec: -8 },
  { abbr: 'Ori', name: 'Orion', ra: 83.8, dec: -5.4 },
  { abbr: 'Peg', name: 'Pegasus', ra: 340, dec: 22 },
  { abbr: 'Per', name: 'Perseus', ra: 55, dec: 45 },
  { abbr: 'Psc', name: 'Pisces', ra: 5, dec: 12 },
  { abbr: 'Sco', name: 'Scorpius', ra: 245, dec: -30 },
  { abbr: 'Sgr', name: 'Sagittarius', ra: 285, dec: -28 },
  { abbr: 'Tau', name: 'Taurus', ra: 65, dec: 18 },
  { abbr: 'UMa', name: 'Ursa Major', ra: 165, dec: 55 },
  { abbr: 'UMi', name: 'Ursa Minor', ra: 230, dec: 75 },
  { abbr: 'Vir', name: 'Virgo', ra: 200, dec: 0 },
];

export function findConstellation(q: string): Constellation | null {
  const t = q.trim().toLowerCase();
  return CONSTELLATIONS.find((c) => c.name.toLowerCase() === t || c.abbr.toLowerCase() === t) ?? null;
}

// ---------- SPHEREx spectral channels: 102 LVF channels in 6 detectors ----------
export interface SpecChannel { idx: number; detector: number; wave_um: number }
function linspace(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / Math.max(1, n - 1));
  return out;
}
const DET_RANGES: Array<[number, number, number]> = [
  [1, 0.75, 1.09], [2, 1.1, 1.62], [3, 1.63, 2.41],
  [4, 2.42, 3.82], [5, 3.83, 4.41], [6, 4.42, 5.0],
];
export const CHANNELS: SpecChannel[] = (() => {
  const out: SpecChannel[] = [];
  let idx = 0;
  for (const [det, a, b] of DET_RANGES) {
    for (const w of linspace(a, b, 17)) out.push({ idx: idx++, detector: det, wave_um: +w.toFixed(3) });
  }
  return out;
})();

export function channelsOfDetector(det: number): SpecChannel[] {
  return CHANNELS.filter((c) => c.detector === det);
}

// ---------- stretch + colormaps (mirror of backend/cutouts render) ----------
export type Stretch = 'linear' | 'log' | 'sqrt' | 'asinh';
export type Colormap = 'grayscale' | 'viridis' | 'inferno' | 'cividis';

export function applyStretch(v: number, s: Stretch): number {
  const x = Math.min(1, Math.max(0, v));
  switch (s) {
    case 'linear': return x;
    case 'sqrt': return Math.sqrt(x);
    case 'log': return Math.log10(1 + 9 * x);
    case 'asinh': return Math.asinh(4 * x) / Math.asinh(4);
  }
}

// percentile-free normalize helper used by canvas engine + tests
export function normalize(v: number, vmin: number, vmax: number, s: Stretch, invert: boolean): number {
  if (!(vmax > vmin)) return 0;
  let t = (v - vmin) / (vmax - vmin);
  t = Math.min(1, Math.max(0, t));
  t = applyStretch(t, s);
  return invert ? 1 - t : t;
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
type RGB = [number, number, number];
const VIRIDIS: RGB[] = [[68, 1, 84], [33, 145, 140], [253, 231, 37]];
const INFERNO: RGB[] = [[0, 0, 4], [188, 55, 84], [252, 255, 164]];
const CIVIDIS: RGB[] = [[0, 34, 78], [125, 125, 125], [255, 233, 69]];

function ramp(stops: RGB[], t: number): RGB {
  const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const f = t * (stops.length - 1) - seg;
  const a = stops[seg];
  const b = stops[seg + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

export function colormap(t: number, cm: Colormap): RGB {
  const x = Math.min(1, Math.max(0, t));
  switch (cm) {
    case 'grayscale': { const g = Math.round(x * 255); return [g, g, g]; }
    case 'viridis': return ramp(VIRIDIS, x).map(Math.round) as RGB;
    case 'inferno': return ramp(INFERNO, x).map(Math.round) as RGB;
    case 'cividis': return ramp(CIVIDIS, x).map(Math.round) as RGB;
  }
}

// ---------- motion math ----------
export function arcsecPerDay(raA: number, decA: number, raB: number, decB: number, dtDays: number): number | null {
  if (!(dtDays > 0)) return null;
  const dRa = (raB - raA) * 3600 * Math.cos(((decA + decB) / 2) * (Math.PI / 180));
  const dDec = (decB - decA) * 3600;
  return Math.hypot(dRa, dDec) / dtDays;
}

// ---------- permalinks: encode view state in hash query ----------
export interface ViewState {
  showcase?: string; ra?: number; dec?: number; fov?: number;
  band?: number; epoch?: number; mode?: string;
}
export function encodeView(s: ViewState): string {
  const p = new URLSearchParams();
  if (s.showcase) p.set('showcase', s.showcase);
  if (s.ra !== undefined) p.set('ra', s.ra.toFixed(4));
  if (s.dec !== undefined) p.set('dec', s.dec.toFixed(4));
  if (s.fov !== undefined) p.set('fov', String(s.fov));
  if (s.band !== undefined) p.set('band', String(s.band));
  if (s.epoch !== undefined) p.set('epoch', String(s.epoch));
  if (s.mode) p.set('mode', s.mode);
  const qs = p.toString();
  return qs ? `#/blink/${s.showcase ?? ''}?${qs}` : '#/';
}
export function decodeView(hash: string): ViewState {
  const out: ViewState = {};
  const m = hash.match(/#\/blink\/([^?]*)\??(.*)/);
  if (!m) return out;
  if (m[1]) out.showcase = decodeURIComponent(m[1]);
  for (const [k, v] of new URLSearchParams(m[2] || '')) {
    if (k === 'ra' || k === 'dec' || k === 'fov') {
      const n = parseFloat(v);
      if (Number.isFinite(n)) (out as Record<string, number>)[k] = n;
    } else if (k === 'band' || k === 'epoch') {
      const n = parseInt(v, 10);
      if (Number.isInteger(n)) (out as Record<string, number>)[k] = n;
    } else if (k === 'mode' || k === 'showcase') {
      (out as Record<string, string>)[k] = v;
    }
  }
  return out;
}

// ---------- export helpers ----------
export function toCSV(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
