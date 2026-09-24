'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  period: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

const COUNTS = [220, 120, 60];
const SCROLL_SPEEDS = [2, 6, 14]; // px of star shift per 1000px of page scroll
const RADII = [0.6, 1.0, 1.5];
const BASE_ALPHA = [0.26, 0.38, 0.55]; // capped so body copy contrast holds
const DRIFT_PX_S = 1.5;
const METEOR_EVERY_MS = 9000;
const METEOR_FADE_MS = 800;
const TAU = Math.PI * 2;

function seedLayers(): Star[][] {
  return COUNTS.map((n, li) =>
    Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: RADII[li] * (0.7 + Math.random() * 0.6),
      phase: Math.random() * TAU,
      period: 2 + Math.random() * 4,
    })),
  );
}

/**
 * SpaceBackdrop: fixed full-viewport starfield behind the About copy.
 * Three parallax layers (scroll speeds + slow time drift), sin-phase
 * twinkle, and a rare meteor streak. White-only stars, alpha-capped.
 * Reduced-motion renders one static frame and never loops.
 */
export default function SpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = {
      w: 0,
      h: 0,
      dpr: 1,
      layers: seedLayers(),
      meteor: null as Meteor | null,
      nextMeteorAt: performance.now() + METEOR_EVERY_MS,
      t0: performance.now(),
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    let alive = true;
    let raf = 0;

    const layout = () => {
      S.w = window.innerWidth || 1;
      S.h = window.innerHeight || 1;
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(S.w * S.dpr);
      canvas.height = Math.round(S.h * S.dpr);
    };

    const draw = (now: number) => {
      const { w, h } = S;
      if (!w || !h) return;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = (now - S.t0) / 1000;
      const scrollY = window.scrollY || 0;
      for (let li = 0; li < S.layers.length; li++) {
        const yOff = scrollY * (SCROLL_SPEEDS[li] / 1000) + (S.reduced ? 0 : t * DRIFT_PX_S);
        for (const s of S.layers[li]) {
          const x = s.x * w;
          const y = (((s.y * h + yOff) % h) + h) % h;
          const a = S.reduced
            ? BASE_ALPHA[li]
            : BASE_ALPHA[li] * (0.7 + 0.3 * Math.sin((TAU / s.period) * t + s.phase));
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, TAU);
          ctx.fill();
        }
      }
      if (!S.reduced) {
        if (!S.meteor && now >= S.nextMeteorAt) {
          S.meteor = {
            x: w * (0.15 + Math.random() * 0.7),
            y: h * Math.random() * 0.35,
            vx: -(300 + Math.random() * 200),
            vy: 150 + Math.random() * 100,
            born: now,
          };
        }
        if (S.meteor) {
          const m = S.meteor;
          const age = now - m.born;
          if (age >= METEOR_FADE_MS) {
            S.meteor = null;
            S.nextMeteorAt = now + METEOR_EVERY_MS + Math.random() * 3000;
          } else {
            const k = age / 1000;
            const hx = m.x + m.vx * k;
            const hy = m.y + m.vy * k;
            const vl = Math.hypot(m.vx, m.vy) || 1;
            const len = 110;
            const tx = hx - (m.vx / vl) * len;
            const ty = hy - (m.vy / vl) * len;
            const a = 0.55 * (1 - age / METEOR_FADE_MS);
            ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
          }
        }
      }
    };

    // Single kick() RAF: chains only while live + visible + motion allowed,
    // otherwise paints exactly one static frame per kick.
    const tick = (now: number) => {
      raf = 0;
      try {
        draw(now);
      } catch { /* never throw into the RAF loop */ }
      if (alive && !S.reduced && document.visibilityState === 'visible') {
        raf = requestAnimationFrame(tick);
      }
    };
    const kick = () => {
      if (!raf && alive && !S.reduced && document.visibilityState === 'visible') {
        raf = requestAnimationFrame(tick);
      }
    };

    const onScroll = () => kick();
    const onResize = () => {
      layout();
      if (S.reduced) {
        try {
          draw(performance.now());
        } catch { /* static repaint is best-effort */ }
      } else kick();
    };
    const onVis = () => kick();

    layout();
    if (S.reduced) {
      try {
        draw(performance.now());
      } catch { /* static first frame is best-effort */ }
    } else {
      kick();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        width: '100vw', height: '100vh', display: 'block',
      }}
    />
  );
}
