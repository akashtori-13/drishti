'use client';

/**
 * Real-sky map layer: Yale Bright Star Catalog stars (V<=5.0, J2000),
 * d3-celestial constellation lines (Ofrohn mirror, vendored), and Messier/NGC
 * nebula positions rendered as soft artistic glows over the 2MASS base.
 *
 * Honesty contract: star/line coordinates are catalog data; nebula glows and
 * the Milky Way mood are interpretation (positions real, rendering artistic).
 * Same equirectangular mapping as the hero overlays (x = RA/360, y = (90-Dec)/180)
 * so catalog points register with showcase markers.
 */

export interface CatStar { ra: number; dec: number; mag: number; bv: number }

interface BrightFile { stars: Array<[number, number, number, number]> }
interface LineFile { features: Array<{ id: string; geometry: { coordinates: number[][][] } }> }

const normRa = (ra: number) => ((ra % 360) + 360) % 360;

import { swr } from '@/lib/cachefirst';

let starsP: Promise<CatStar[]> | null = null;
let linesP: Promise<LineFile> | null = null;

export function loadBrightStars(): Promise<CatStar[]> {
  if (!starsP) {
    starsP = swr<BrightFile>('sh-stars', '/data/bright-stars.json', Infinity)
      .then((r) => (r?.data.stars ?? []).map(([ra, dec, mag, bv]) => ({ ra, dec, mag, bv })))
      .catch(() => []);
  }
  return starsP;
}

export function loadConstellationLines(): Promise<LineFile> {
  if (!linesP) {
    linesP = swr<LineFile>('sh-lines', '/data/constellations.lines.json', Infinity)
      .then((r) => r?.data ?? { features: [] })
      .catch(() => ({ features: [] }));
  }
  return linesP;
}

/** Bright deep-sky objects at Messier/NGC positions. sizeDeg ~ apparent extent. */
export interface Nebula { name: string; ra: number; dec: number; sizeDeg: number; kind: 'rose' | 'teal' | 'blue' | 'dark' }
export const NEBULAE: Nebula[] = [
  { name: 'M42', ra: 83.82, dec: -5.39, sizeDeg: 1.4, kind: 'rose' },
  { name: 'M8', ra: 270.9, dec: -24.38, sizeDeg: 1.1, kind: 'rose' },
  { name: 'M16', ra: 274.68, dec: -13.81, sizeDeg: 0.9, kind: 'rose' },
  { name: 'M17', ra: 275.08, dec: -16.17, sizeDeg: 0.8, kind: 'rose' },
  { name: 'M20', ra: 270.59, dec: -23.03, sizeDeg: 0.6, kind: 'rose' },
  { name: 'Carina', ra: 161.26, dec: -59.87, sizeDeg: 1.6, kind: 'rose' },
  { name: 'Tarantula', ra: 84.68, dec: -69.1, sizeDeg: 1.1, kind: 'rose' },
  { name: 'M57', ra: 283.4, dec: 33.03, sizeDeg: 0.2, kind: 'teal' },
  { name: 'M27', ra: 297.92, dec: 22.72, sizeDeg: 0.3, kind: 'teal' },
  { name: 'M1', ra: 83.63, dec: 22.01, sizeDeg: 0.25, kind: 'rose' },
  { name: 'M45', ra: 56.75, dec: 24.12, sizeDeg: 1.3, kind: 'blue' },
  { name: 'M31', ra: 10.68, dec: 41.27, sizeDeg: 2.6, kind: 'blue' },
  { name: 'LMC', ra: 80.89, dec: -69.76, sizeDeg: 4.2, kind: 'blue' },
  { name: 'SMC', ra: 13.19, dec: -72.83, sizeDeg: 2.6, kind: 'blue' },
  { name: 'Coalsack', ra: 187.5, dec: -62.5, sizeDeg: 2.0, kind: 'dark' },
  { name: 'Horsehead', ra: 85.25, dec: -2.46, sizeDeg: 0.45, kind: 'dark' },
];

/** Major constellations labeled on the map (abbr + J2000 center). */
export const LABELED: Array<{ abbr: string; ra: number; dec: number }> = [
  { abbr: 'Ori', ra: 83, dec: 0 }, { abbr: 'CMa', ra: 105, dec: -22 },
  { abbr: 'Tau', ra: 65, dec: 15 }, { abbr: 'Gem', ra: 113, dec: 28 },
  { abbr: 'Leo', ra: 152, dec: 15 }, { abbr: 'UMa', ra: 165, dec: 55 },
  { abbr: 'Cas', ra: 15, dec: 60 }, { abbr: 'And', ra: 12, dec: 38 },
  { abbr: 'Peg', ra: 340, dec: 20 }, { abbr: 'Cyg', ra: 305, dec: 40 },
  { abbr: 'Lyr', ra: 283, dec: 34 }, { abbr: 'Aql', ra: 297, dec: 5 },
  { abbr: 'Sco', ra: 245, dec: -30 }, { abbr: 'Sgr', ra: 285, dec: -30 },
  { abbr: 'Cru', ra: 186, dec: -60 }, { abbr: 'Cen', ra: 200, dec: -50 },
  { abbr: 'Car', ra: 161, dec: -60 }, { abbr: 'Vel', ra: 135, dec: -50 },
  { abbr: 'Eri', ra: 60, dec: -25 }, { abbr: 'Aur', ra: 90, dec: 40 },
  { abbr: 'Per', ra: 55, dec: 45 }, { abbr: 'Boo', ra: 225, dec: 30 },
  { abbr: 'Vir', ra: 200, dec: 0 }, { abbr: 'Oph', ra: 260, dec: -10 },
];

const GLOW: Record<Nebula['kind'], [string, string]> = {
  rose: ['255,110,140', '255,110,140'],
  teal: ['110,220,230', '110,220,230'],
  blue: ['170,190,255', '170,190,255'],
  dark: ['0,0,0', '0,0,0'],
};

function starColor(bv: number): string {
  if (bv < 0.3) return '200,220,255';
  if (bv < 0.7) return '235,240,250';
  if (bv < 1.2) return '255,226,190';
  return '255,198,148';
}

function starR(mag: number): number {
  return Math.max(0.6, 2.9 - 0.5 * mag);
}

/** Prerendered static layer (lines, nebulae, dim stars) at device pixels. */
const layerCache = new Map<string, HTMLCanvasElement>();

export async function getStarLayer(w: number, h: number, dpr: number): Promise<HTMLCanvasElement | null> {
  const key = `${Math.round(w)}x${Math.round(h)}@${dpr}`;
  const hit = layerCache.get(key);
  if (hit) return hit;
  const [stars, lines] = await Promise.all([loadBrightStars(), loadConstellationLines()]);
  if (!stars.length && !lines.features.length) return null;
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const X = (ra: number) => (normRa(ra) / 360) * W;
  const Y = (dec: number) => ((90 - dec) / 180) * H;
  const px = (deg: number) => (deg / 360) * W;

  // constellation lines (pen up across the RA seam)
  ctx.strokeStyle = 'rgba(165,172,255,.30)';
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  for (const f of lines.features) {
    for (const ring of f.geometry.coordinates) {
      let pen = false;
      let lx = 0;
      ctx.beginPath();
      for (const [ra, dec] of ring) {
        const x = X(ra);
        const y = Y(dec);
        if (!pen || Math.abs(x - lx) > W / 2) { ctx.moveTo(x, y); pen = true; }
        else ctx.lineTo(x, y);
        lx = x;
      }
      ctx.stroke();
    }
  }
  // constellation labels
  ctx.font = `${Math.round(10 * dpr)}px "Geist Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(170,176,200,.55)';
  for (const c of LABELED) ctx.fillText(c.abbr, X(c.ra), Y(c.dec));

  // nebula glows (artistic; positions catalog-real)
  for (const n of NEBULAE) {
    const x = X(n.ra);
    const y = Y(n.dec);
    const r = Math.max(2 * dpr, (px(n.sizeDeg) / 2) * 2.2);
    const [rgb] = GLOW[n.kind];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (n.kind === 'dark') {
      g.addColorStop(0, `rgba(2,3,8,.5)`);
      g.addColorStop(1, 'rgba(2,3,8,0)');
    } else {
      g.addColorStop(0, `rgba(${rgb},.15)`);
      g.addColorStop(0.55, `rgba(${rgb},.06)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // dim catalog stars (bright ones twinkle live in the frame loop)
  for (const s of stars) {
    if (s.mag <= 2.5) continue;
    const r = starR(s.mag) * dpr;
    ctx.fillStyle = `rgba(${starColor(s.bv)},.92)`;
    ctx.beginPath(); ctx.arc(X(s.ra), Y(s.dec), r, 0, Math.PI * 2); ctx.fill();
  }

  layerCache.clear();
  layerCache.set(key, cv);
  return cv;
}

/** Bright catalog stars drawn live each frame (deterministic twinkle phases). */
export function drawBrightTwinkles(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, live: boolean,
  stars: CatStar[],
) {
  const TAU = Math.PI * 2;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s.mag > 2.5) continue;
    const x = (normRa(s.ra) / 360) * w;
    const y = ((90 - s.dec) / 180) * h;
    const tw = live ? 0.72 + 0.28 * Math.sin((i * 2.399) % TAU + t * (0.6 + (i % 5) * 0.22)) : 0.9;
    const r = starR(s.mag);
    const col = starColor(s.bv);
    if (s.mag < 1.0) {
      const R = r * 3.4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(${col},${(0.55 * tw).toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      // diffraction spikes on the handful of brightest
      ctx.strokeStyle = `rgba(${col},${(0.5 * tw).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - R, y); ctx.lineTo(x + R, y);
      ctx.moveTo(x, y - R); ctx.lineTo(x, y + R);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${col},${(0.95 * tw).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}
