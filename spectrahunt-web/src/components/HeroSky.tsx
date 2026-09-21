'use client';

import { useEffect, useRef } from 'react';
import {
  GRID_H, GRID_W, LEVEL_COLORS, STAR_FILL, TAU, cellOf, drawBracket,
  fmtDec, fmtRa, genStars, type Star,
} from '@/lib/sky';

export interface SkyHover { i: number; j: number; ra: number; dec: number; n: number; x: number; y: number }

/** Full-page interactive hero sky: twinkle, nebula wash, orbiting mover demo, click-to-inspect. */
export default function HeroSky({
  grid, coverage, onInspect,
}: {
  grid: number[][]; coverage: boolean;
  onInspect: (ra: number, dec: number, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useRef<{
    w: number; h: number; stars: Star[]; blobs: { x: number; y: number; r: number; hue: number }[];
    mover: { cx: number; cy: number; step: number } | null;
    hover: (SkyHover & { nx: number; ny: number }) | null;
    selected: { nx: number; ny: number } | null;
    grid: number[][]; coverage: boolean;
  }>({ w: 0, h: 0, stars: [], blobs: [], mover: null, hover: null, selected: null, grid, coverage });
  const cb = useRef(onInspect);
  useEffect(() => {
    cb.current = onInspect;
    state.current.grid = grid;
    state.current.coverage = coverage;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = state.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

    const layout = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.w = w; st.h = h;
      st.stars = genStars(1337, Math.min(1400, Math.floor((w * h) / 2500)));
      st.blobs = [235, 205, 20, 265, 300].map((hue, k) => {
        const l = ((k * 0.37 + 0.11) % 1 + 1) % 1;
        return { x: (k * 0.23 + 0.07) % 1, y: (l * 0.8 + 0.1) % 1, r: 0.14 + ((k * 0.13) % 0.2), hue };
      });
      // Park the mover demo in free space beside the text stack.
      const core = host.querySelector('.hero-core') as HTMLElement | null;
      const navH = 60;
      const step = Math.max(26, Math.min(w, h) * 0.05);
      st.mover = null;
      if (core) {
        const top = core.offsetTop;
        const right = core.offsetLeft + core.offsetWidth;
        if (w - right >= 170 + step) {
          st.mover = { cx: right + (w - right) / 2, cy: top + core.offsetHeight * 0.16, step };
        } else if (top - navH >= step * 2.6 + 24) {
          st.mover = { cx: w * 0.76, cy: navH + (top - navH) / 2, step };
        }
      }
    };

    const drawMover = (t: number) => {
      const m = st.mover;
      if (!m) return;
      const pts = [0, 1, 2].map((i) => ({ x: m.cx + (i - 1) * m.step, y: m.cy - (i - 1) * m.step * 0.62 }));
      const idx = reduce.matches ? 1 : Math.floor(t / 1500) % 3;
      const narrow = pts[2].x + 21 + 92 > st.w - 8;
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(238,240,248,.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p, i) => {
        if (i === idx) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU);
        ctx.strokeStyle = 'rgba(238,240,248,.42)'; ctx.stroke();
      });
      const a = pts[idx];
      const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 24);
      g.addColorStop(0, 'rgba(240,138,75,.6)');
      g.addColorStop(1, 'rgba(240,138,75,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(a.x, a.y, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(a.x, a.y, 3.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(238,240,248,.92)';
      ctx.lineWidth = 1.25;
      drawBracket(ctx, a.x, a.y, 13, 5);
      ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(238,240,248,.8)';
      ctx.textAlign = narrow ? 'right' : 'left';
      ctx.fillText(`2026W${10 + idx * 3}_2B`, a.x + (narrow ? -21 : 21), a.y);
      ctx.restore();
    };

    const draw = (t: number) => {
      const { w, h } = st;
      if (!w || !h) return;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#070915');
      bg.addColorStop(1, '#04050a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      const m = Math.max(w, h);
      for (const b of st.blobs) {
        const x = b.x * w;
        const y = b.y * h;
        const r = b.r * m;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${b.hue},62%,46%,.06)`);
        g.addColorStop(1, `hsla(${b.hue},62%,46%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      if (st.coverage) {
        const cw = w / GRID_W;
        const ch = h / GRID_H;
        for (let j = 0; j < GRID_H; j++) {
          for (let i = 0; i < GRID_W; i++) {
            const e = st.grid[j][i];
            if (!e) continue;
            const dx = ((i + 0.5) / GRID_W - 0.5) / 0.42;
            const dy = ((j + 0.5) / GRID_H - 0.5) / 0.32;
            const d = Math.min(1, Math.hypot(dx, dy));
            const att = d * d * (3 - 2 * d);
            if (att < 0.03) continue;
            ctx.globalAlpha = 0.5 * att;
            ctx.fillStyle = LEVEL_COLORS[e] as string;
            ctx.fillRect(i * cw + 0.5, j * ch + 0.5, cw - 1, ch - 1);
          }
        }
        ctx.globalAlpha = 1;
      }

      const tw = t * 0.0011;
      st.stars.forEach((s, i) => {
        const dx = (s.x - 0.5) / 0.4;
        const dy = (s.y - 0.5) / 0.3;
        const d = Math.min(1, Math.hypot(dx, dy));
        const att = 0.14 + 0.86 * (d * d * (3 - 2 * d));
        ctx.globalAlpha = Math.min(1, s.b * att * (0.86 + 0.14 * Math.sin(tw + i * 12.9898)));
        ctx.fillStyle = STAR_FILL[s.ci];
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (st.hover) {
        const hv = st.hover;
        const cw = w / GRID_W;
        const ch = h / GRID_H;
        ctx.strokeStyle = 'rgba(238,240,248,.75)';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(hv.i * cw + 0.5, hv.j * ch + 0.5, cw - 1, ch - 1);
        const txt = `RA ${fmtRa(hv.ra)}  Dec ${fmtDec(hv.dec)}  ${hv.n} ${hv.n === 1 ? 'epoch' : 'epochs'}`;
        ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const twd = ctx.measureText(txt).width;
        let x = hv.x + 16;
        let align: CanvasTextAlign = 'left';
        if (x + twd > w - 10) { x = hv.x - 16; align = 'right'; }
        const y = Math.max(20, Math.min(h - 20, hv.y + 18));
        ctx.textAlign = align;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(5,6,12,.9)';
        ctx.strokeText(txt, x, y);
        ctx.fillStyle = 'rgba(238,240,248,.92)';
        ctx.fillText(txt, x, y);
      }
      if (st.selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        drawBracket(ctx, st.selected.nx * w, st.selected.ny * h, 14, 6);
      }
      drawMover(t);
    };

    const tick = (t: number) => {
      raf = 0;
      draw(t);
      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    const onChange = () => kick();
    reduce.addEventListener?.('change', onChange);

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const ra = nx * 360;
      const dec = 90 - ny * 180;
      const c = cellOf(ra, dec);
      st.hover = { ...c, ra, dec, n: st.grid[c.j][c.i], x: nx * st.w, y: ny * st.h, nx, ny };
      kick();
    };
    const leave = () => { st.hover = null; kick(); };
    const click = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      st.selected = { nx, ny };
      cb.current(nx * 360, 90 - ny * 180, e.clientX, e.clientY);
      kick();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('click', click);

    layout();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(host);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      reduce.removeEventListener?.('change', onChange);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('click', click);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} id="heroCanvas" aria-hidden="true" />
    </div>
  );
}
