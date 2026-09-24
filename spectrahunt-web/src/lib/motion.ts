// Real in-browser motion detection on blink frames (works offline).
// Downsamples to ≤96px, MAD-noise significance, +/- peak pairing into
// mover dipoles (dark = where-it-was, bright = where-it-is).

export interface MotionCandidate {
  /** normalized 0..1 image coords */
  x: number; y: number;
  /** dipole vector in normalized units (from A to B) */
  dx: number; dy: number;
  kind: 'mover' | 'variable';
  sigma: number;
}

/** A candidate with measured endpoint brightness + a stable cross-pair number. */
export interface TrackedCandidate extends MotionCandidate {
  /** stable 1-based number, persistent across epoch pairs (0 = unassigned) */
  n: number;
  /** measured brightness 0..1 at the candidate in the prev / cur frames */
  ba: number; bb: number;
}

/** Brightness 0..1 of a downsampled gray grid at normalized coords. */
export function sampleGrayAt(gray: { data: Float32Array; w: number; h: number }, x: number, y: number): number {
  const gx = Math.max(0, Math.min(gray.w - 1, Math.round(x * (gray.w - 1))));
  const gy = Math.max(0, Math.min(gray.h - 1, Math.round(y * (gray.h - 1))));
  return Math.max(0, Math.min(1, gray.data[gy * gray.w + gx]));
}

export interface TrackLink { x: number; y: number; dx: number; dy: number; n: number }

/** A linked object across epoch pairs: every measured position in order. */
export interface Track {
  n: number;
  kind: string;
  sigma: number;
  points: Array<{ epoch: number; x: number; y: number }>;
}

/** Chain per-pair detections (already numbered) into full tracks by number. */
export function buildTracks(numbered: TrackedCandidate[][]): Track[] {
  const byN = new Map<number, Track>();
  numbered.forEach((pair, epoch) => {
    for (const c of pair) {
      if (!c.n) continue;
      let t = byN.get(c.n);
      if (!t) {
        t = { n: c.n, kind: c.kind, sigma: c.sigma, points: [] };
        byN.set(c.n, t);
      }
      if (c.sigma > t.sigma) { t.sigma = c.sigma; t.kind = c.kind; }
      t.points.push({ epoch, x: c.x, y: c.y });
    }
  });
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

/** Greedy cross-pair identity: match each current candidate to the previous
 *  pair's predicted position (movers lead by their dipole). Returns the
 *  1-based number per current index plus the next free number. Pure. */
export function assignTrackIds(
  prev: TrackLink[], cur: Array<{ x: number; y: number; dx: number; dy: number; kind: string }>,
  nextN: number, radius = 0.12,
): { ids: number[]; next: number } {
  const used = new Set<number>();
  const ids: number[] = [];
  let free = nextN;
  for (const c of cur) {
    const px = c.kind === 'mover' ? c.x + c.dx : c.x;
    const py = c.kind === 'mover' ? c.y + c.dy : c.y;
    let best = -1;
    let bestD = radius;
    prev.forEach((p, k) => {
      if (used.has(k)) return;
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    if (best >= 0) {
      used.add(best);
      ids.push(prev[best].n);
    } else {
      ids.push(free);
      free += 1;
    }
  }
  return { ids, next: free };
}

function grayAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
}

export function sampleGray(img: HTMLImageElement, size = 96): { data: Float32Array; w: number; h: number } | null {
  const aspect = (img.naturalHeight || img.height) / Math.max(1, img.naturalWidth || img.width);
  const w = size;
  const h = Math.max(8, Math.round(size * aspect));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let id: ImageData;
  try {
    id = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = grayAt(id.data, w, x, y);
  }
  return { data: out, w, h };
}

export function detectMotion(
  a: { data: Float32Array; w: number; h: number },
  b: { data: Float32Array; w: number; h: number },
  thresh = 5,
  pairPx = 10,
): MotionCandidate[] {
  const w = Math.min(a.w, b.w);
  const h = Math.min(a.h, b.h);
  const diff = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) diff[i] = b.data[i] - a.data[i];
  const sorted = Array.from(diff).sort((p, q) => p - q);
  const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mad = Math.abs(sorted[Math.floor(sorted.length * 0.75)] - med) || 1e-6;
  const sig = 1.4826 * mad;
  if (sig <= 1e-9) return [];

  interface Peak { x: number; y: number; s: number }
  const find = (sign: 1 | -1): Peak[] => {
    const score = new Float32Array(diff.length);
    for (let i = 0; i < diff.length; i++) score[i] = ((diff[i] - med) / sig) * sign;
    const used = new Uint8Array(diff.length);
    const peaks: Peak[] = [];
    for (let k = 0; k < 40; k++) {
      let bi = -1;
      let bv = thresh;
      for (let i = 0; i < score.length; i++) {
        if (!used[i] && score[i] > bv) { bv = score[i]; bi = i; }
      }
      if (bi < 0) break;
      const x = bi % w;
      const y = Math.floor(bi / w);
      peaks.push({ x, y, s: bv });
      for (let yy = Math.max(0, y - 3); yy <= Math.min(h - 1, y + 3); yy++) {
        for (let xx = Math.max(0, x - 3); xx <= Math.min(w - 1, x + 3); xx++) used[yy * w + xx] = 1;
      }
    }
    return peaks;
  };

  const pos = find(1);
  const neg = find(-1);
  const usedNeg = new Set<number>();
  const out: MotionCandidate[] = [];
  for (const p of pos) {
    let best = -1;
    let bestd = pairPx;
    neg.forEach((q, k) => {
      if (usedNeg.has(k)) return;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bestd) { bestd = d; best = k; }
    });
    if (best >= 0) {
      usedNeg.add(best);
      const q = neg[best];
      out.push({
        x: (p.x + q.x) / 2 / w, y: (p.y + q.y) / 2 / h,
        dx: (p.x - q.x) / w, dy: (p.y - q.y) / h,
        kind: 'mover', sigma: (p.s + q.s) / 2,
      });
    } else {
      out.push({ x: p.x / w, y: p.y / h, dx: 0, dy: 0, kind: 'variable', sigma: p.s });
    }
  }
  neg.forEach((q, k) => {
    if (!usedNeg.has(k)) out.push({ x: q.x / w, y: q.y / h, dx: 0, dy: 0, kind: 'variable', sigma: q.s });
  });
  return out
    .sort((p, q) => q.sigma - p.sigma)
    .slice(0, 8);
}
