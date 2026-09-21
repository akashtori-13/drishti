// Shared sky math: seeded RNG, starfields, coverage tiles, band metadata.
// Mirrors the prototype's deterministic engine; tile values come from real data.

export const TAU = Math.PI * 2;
export const GRID_W = 72;
export const GRID_H = 36;

export const LEVEL_COLORS: Array<string | null> = [
  null, '#141a38', '#1c2554', '#27357a', '#3848a8', '#5a6ce0',
];

export interface Band { id: number; label: string; range: string; color: string }

export const BANDS: Band[] = [
  { id: 1, label: 'Band 1', range: '0.75–1.09 µm', color: '#7c83fd' },
  { id: 2, label: 'Band 2', range: '1.10–1.62 µm', color: '#5aa9e6' },
  { id: 3, label: 'Band 3', range: '1.63–2.41 µm', color: '#4fc9a8' },
  { id: 4, label: 'Band 4', range: '2.42–3.82 µm', color: '#e8c34a' },
  { id: 5, label: 'Band 5', range: '3.83–4.41 µm', color: '#f08a4b' },
  { id: 6, label: 'Band 6', range: '4.42–5.00 µm', color: '#e85d4a' },
];

export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star { x: number; y: number; r: number; b: number; ci: number }

export function genStars(seed: number, count: number): Star[] {
  const rng = mulberry32(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    const c = rng();
    out.push({
      x: rng(), y: rng(),
      r: 0.5 + Math.pow(rng(), 3.2) * 2.6,
      b: 0.25 + rng() * 0.75,
      ci: c < 0.12 ? 1 : c < 0.24 ? 2 : 0,
    });
  }
  return out;
}

export function hexToRgba(hex: string, a: number): string {
  const v = hex.replace('#', '');
  return `rgba(${parseInt(v.substring(0, 2), 16)},${parseInt(v.substring(2, 4), 16)},${parseInt(v.substring(4, 6), 16)},${a})`;
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}

export const STAR_FILL = ['#e6e8f2', '#ffe6c4', '#c9dcff'];

// Real infrared all-sky (2MASS, equirectangular CAR, log stretch).
// Verified: RA increases LEFT (x=0 <-> RA 360, x=W <-> RA 0), Dec +90 top.
// Equirect views MUST mirror X when drawing so overlay math (RA right) matches.
export const SKY_ALLSKY_URL =
  'https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2F2MASS%2Fcolor&ra=180&dec=0&fov=360&width=1440&height=720&projection=CAR&coordsys=icrs&rotation=0&format=jpg&stretch=log';

export const fmtRa = (v: number) => `${Number(v).toFixed(2)}°`;
export const fmtDec = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(2)}°`;

export function cellOf(ra: number, dec: number): { i: number; j: number } {
  return {
    i: Math.min(GRID_W - 1, Math.max(0, Math.floor((ra / 360) * GRID_W))),
    j: Math.min(GRID_H - 1, Math.max(0, Math.floor(((90 - dec) / 180) * GRID_H))),
  };
}

/** Coverage grid: all cells start unmeasured (dark). Real TAP tallies pin values. */
export function buildGrid(): number[][] {
  const grid: number[][] = [];
  for (let j = 0; j < GRID_H; j++) {
    grid.push(new Array<number>(GRID_W).fill(0));
  }
  return grid;
}

export function drawBracket(ctx: CanvasRenderingContext2D, x: number, y: number, b: number, l: number) {
  ctx.beginPath();
  ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).forEach(([sx, sy]) => {
    ctx.moveTo(x + sx * b, y + sy * (b - l));
    ctx.lineTo(x + sx * b, y + sy * b);
    ctx.lineTo(x + sx * (b - l), y + sy * b);
  });
  ctx.stroke();
}
