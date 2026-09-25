'use client';

import { applyStretch, colormap } from '@/lib/astro';
import { loadCachedImage } from '@/lib/skycache';

/** Preview-modal presets, reused verbatim for card thumbnails. */
export type TonePreset = 'grayscale' | 'viridis' | 'cividis';
export type Tone = 'gray' | 'color' | 'cb';
export const TONE_PRESET: Record<Tone, TonePreset> = {
  gray: 'grayscale',
  color: 'viridis',
  cb: 'cividis',
};

const cache = new Map<string, string>();

/** Decoded source image via the shared IndexedDB tile cache (offline-first). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return loadCachedImage(url);
}

/** Render a cutout through the exact preview colormap pipeline. Cached. */
export async function renderTone(url: string, tone: Tone, side = 260): Promise<string> {
  const key = `${url}|${tone}|${side}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = await loadImage(url);
  const cv = document.createElement('canvas');
  cv.width = side;
  cv.height = side;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  // cover-draw to the square, mirroring the card's object-fit: cover
  const scale = Math.max(side / img.width, side / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (side - dw) / 2, (side - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, side, side);
  const px = data.data;
  const cmap = TONE_PRESET[tone];
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    let t = Math.min(1, Math.max(0, (lum - 0.05) / 0.93));
    t = applyStretch(t, 'asinh');
    const [r, g, b] = colormap(t, cmap);
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const out = cv.toDataURL('image/png');
  cache.set(key, out);
  // bounded: 40 rendered thumbs max (audit F10); dataURLs are ~100KB each
  if (cache.size > 40) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return out;
}
