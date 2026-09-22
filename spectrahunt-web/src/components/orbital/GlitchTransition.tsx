'use client';

// Act 2 of the BORESIGHT orbital intro (docs/ORBITAL_INTRO.md): the tear.
// Lock-on dolly (0-350ms) -> RGB-split + slice displacement tear (350-800ms,
// white flash ~700ms) -> punch through the aperture (800-1100ms). The parent
// swaps route under the flash; a second click skips straight to the end.
// Single-canvas 2D post-pass, no WebGL. Reduced motion: plain crossfade.

import { useEffect, useRef } from 'react';

export interface GlitchTransitionProps {
  /** Live orbital frame to tear from (snapshotted on mount). */
  source: HTMLCanvasElement | null;
  /** Screen point to punch through (CSS px, viewport space). Defaults to center. */
  focus: { x: number; y: number } | null;
  onDone: () => void;
  durationMs?: number;
}

function separated(src: HTMLCanvasElement, keep: 'r' | 'g' | 'b'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  if (!g) return c;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = keep === 'r' ? '#ff0000' : keep === 'g' ? '#00ff00' : '#0000ff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export default function GlitchTransition({ source, focus, onDone, durationMs = 1100 }: GlitchTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onDone);
  useEffect(() => {
    cb.current = onDone;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cb.current();
      return;
    }
    let alive = true;
    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      window.setTimeout(() => {
        if (alive) cb.current();
      }, 60);
    };

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const fx = focus?.x ?? w / 2;
    const fy = focus?.y ?? h / 2;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // snapshot the live frame once; tear the copy, never the source
    const snap = document.createElement('canvas');
    snap.width = canvas.width;
    snap.height = canvas.height;
    const sg = snap.getContext('2d');
    if (sg && source && source.width > 0) {
      try {
        sg.drawImage(source, 0, 0, snap.width, snap.height);
      } catch {
        sg.fillStyle = '#05060c';
        sg.fillRect(0, 0, snap.width, snap.height);
      }
    } else if (sg) {
      sg.fillStyle = '#05060c';
      sg.fillRect(0, 0, snap.width, snap.height);
    }
    const chR = separated(snap, 'r');
    const chG = separated(snap, 'g');

    if (reduced) {
      const t0 = performance.now();
      const fade = (t: number) => {
        if (!alive) return;
        const p = Math.min(1, (t - t0) / 260);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.drawImage(snap, 0, 0);
        ctx.fillStyle = '#05060c';
        ctx.globalAlpha = p;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        if (p < 1) raf = requestAnimationFrame(fade);
        else finish();
      };
      raf = requestAnimationFrame(fade);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') finish();
      };
      document.addEventListener('keydown', onKey);
      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        document.removeEventListener('keydown', onKey);
      };
    }

    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const t0 = performance.now();
    // deterministic-ish slice rows per frame would strobe; reseed each frame
    const draw = (now: number) => {
      if (!alive) return;
      const t = now - t0;
      const p = Math.min(1, t / durationMs);
      const W = canvas.width;
      const H = canvas.height;
      const fxd = fx * dpr;
      const fyd = fy * dpr;

      // zoom path: gentle dolly, then punch through the aperture
      let zoom: number;
      if (p < 0.32) zoom = 1 + 0.14 * easeOut(p / 0.32);
      else if (p < 0.73) zoom = 1.14 + 0.1 * (p - 0.32);
      else zoom = 1.24 * Math.pow(22, (p - 0.73) / 0.27);
      const sw = W / zoom;
      const sh = H / zoom;
      const sx = Math.min(Math.max(fxd - sw / 2, 0), Math.max(0, W - sw));
      const sy = Math.min(Math.max(fyd - sh / 2, 0), Math.max(0, H - sh));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // micro-jitter during the tear
      const jx = p > 0.32 && p < 0.73 ? (Math.random() - 0.5) * 7 * dpr : 0;
      const jy = p > 0.32 && p < 0.73 ? (Math.random() - 0.5) * 5 * dpr : 0;
      ctx.drawImage(snap, sx, sy, sw, sh, jx, jy, W, H);

      if (p >= 0.32 && p < 0.8) {
        // RGB channel split, oscillating
        const d = (2 + 3 * Math.abs(Math.sin(t / 90)) + Math.random() * 3) * dpr;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65;
        ctx.drawImage(chR, sx, sy, sw, sh, -d + jx, jy, W, H);
        ctx.drawImage(chG, sx, sy, sw, sh, d + jx, jy, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // horizontal slice displacement: 8-16 rows shift ±x
        const rows = 8 + Math.floor(Math.random() * 9);
        for (let i = 0; i < rows; i++) {
          const ry = Math.random() * H;
          const rh = (3 + Math.random() * 14) * dpr;
          const dx = (Math.random() - 0.5) * 34 * dpr;
          try {
            ctx.drawImage(canvas, 0, ry, W, rh, dx, ry, W, rh);
          } catch {
            /* self-blit edge: skip the row */
          }
        }
        // scanline interference
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = (t / 8) % 4; y < H; y += 4 * dpr) {
          ctx.fillRect(0, y, W, Math.max(1, dpr));
        }
      }

      if (p >= 0.73) {
        // through the aperture: streaks align into the coming sky, exposure rises
        const q = (p - 0.73) / 0.27;
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - q * 0.4);
        ctx.strokeStyle = '#cdd3ea';
        ctx.lineWidth = Math.max(1, dpr);
        const maxR = Math.hypot(W, H) / 2;
        for (let i = 0; i < 42; i++) {
          const a = (i / 42) * Math.PI * 2 + q * 0.6;
          const r0 = maxR * 0.12 * q;
          const r1 = maxR * (0.12 + 0.88 * q * q);
          ctx.beginPath();
          ctx.moveTo(fxd + Math.cos(a) * r0, fyd + Math.sin(a) * r0);
          ctx.lineTo(fxd + Math.cos(a) * r1, fyd + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // white-frame flash ~700ms, then exposure to white at the punch
      let flash = 0;
      if (p >= 0.6 && p < 0.72) flash = 0.85 * Math.sin(((p - 0.6) / 0.12) * Math.PI);
      if (p >= 0.9) flash = Math.max(flash, (p - 0.9) / 0.1);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash)})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (p >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    const onPointer = () => finish(); // second click = skip to end
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    canvas.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="orbital-tear"
      role="img"
      aria-label="Passing through the spacecraft aperture into its view."
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'block', cursor: 'wait' }}
    />
  );
}
