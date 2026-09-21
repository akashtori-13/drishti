'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GRID_H, GRID_W, LEVEL_COLORS, STAR_FILL, TAU, cellOf, drawBracket,
  genStars, SKY_ALLSKY_URL, type Star,
} from '@/lib/sky';
import { loadCachedImage } from '@/lib/skycache';
import type { SkyHover } from '@/components/HeroSky';

export interface MapSelection { nx: number; ny: number; ra: number; dec: number }

/** Equirectangular all-sky coverage map: tiles, graticule, hover, click-to-inspect. */
export default function CoverageMap({
  grid, coverage, selected, onHover, onInspect,
}: {
  grid: number[][]; coverage: boolean; selected: MapSelection | null;
  onHover: (h: SkyHover | null) => void;
  onInspect: (ra: number, dec: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ w: number; h: number; stars: Star[] } & {
    grid: number[][]; coverage: boolean; selected: MapSelection | null;
  }>({ w: 0, h: 0, stars: [], grid, coverage, selected });
  const cb = useRef({ onHover, onInspect });
  useEffect(() => {
    cb.current = { onHover, onInspect };
    st.current.grid = grid;
    st.current.coverage = coverage;
    st.current.selected = selected;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = st.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let hover: (SkyHover & { nx: number; ny: number }) | null = null;

    const layout = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.w = w; s.h = h;
      s.stars = genStars(2024, Math.min(1500, Math.floor((w * h) / 3200)));
    };

    const draw = (t: number) => {
      const { w, h } = s;
      if (!w || !h) return;
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const m = Math.max(w, h);
      [235, 205, 20, 265, 300].forEach((hue, k) => {
        const x = ((k * 0.23 + 0.07) % 1) * w;
        const y = (((k * 0.37 + 0.11) % 1) * 0.8 + 0.1) * h;
        const r = (0.14 + ((k * 0.13) % 0.2)) * m;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${hue},62%,46%,.05)`);
        g.addColorStop(1, `hsla(${hue},62%,46%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      const cw = w / GRID_W;
      const ch = h / GRID_H;
      if (s.coverage) {
        for (let j = 0; j < GRID_H; j++) {
          for (let i = 0; i < GRID_W; i++) {
            const e = s.grid[j][i];
            if (!e) continue;
            ctx.fillStyle = LEVEL_COLORS[e] as string;
            ctx.fillRect(i * cw + 0.5, j * ch + 0.5, cw - 1, ch - 1);
          }
        }
      }

      ctx.lineWidth = 1;
      for (let ra = 30; ra < 360; ra += 30) {
        const x = Math.round((ra / 360) * w) + 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,.07)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let dec = -60; dec <= 60; dec += 30) {
        const y = Math.round(((90 - dec) / 180) * h) + 0.5;
        ctx.strokeStyle = dec === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.font = '500 11px "Geist Mono", ui-monospace, monospace';
      ctx.lineJoin = 'round';
      const label = (txt: string, x: number, y: number, align: CanvasTextAlign) => {
        ctx.textAlign = align;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(5,6,12,.85)';
        ctx.strokeText(txt, x, y);
        ctx.fillStyle = 'rgba(196,202,226,.78)';
        ctx.fillText(txt, x, y);
      };
      const eqY = (90 / 180) * h;
      for (let ra = 30; ra < 360; ra += 30) label(`${ra}°`, (ra / 360) * w + 5, eqY - 6, 'left');
      for (let dec = -60; dec <= 60; dec += 30) {
        if (dec === 0) continue;
        label(`${dec > 0 ? '+' : '−'}${Math.abs(dec)}°`, w - 10, ((90 - dec) / 180) * h - 6, 'right');
      }
      label('0°', w - 10, eqY - 6, 'right');

      const tw = t * 0.0011;
      s.stars.forEach((star, i) => {
        ctx.globalAlpha = Math.min(1, star.b * (0.88 + 0.12 * Math.sin(tw + i * 12.9898)));
        ctx.fillStyle = STAR_FILL[star.ci];
        ctx.beginPath(); ctx.arc(star.x * w, star.y * h, star.r * 0.85, 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (hover) {
        ctx.strokeStyle = 'rgba(238,240,248,.75)';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(hover.i * cw + 0.5, hover.j * ch + 0.5, cw - 1, ch - 1);
      }
      if (s.selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        drawBracket(ctx, s.selected.nx * w, s.selected.ny * h, 14, 6);
        ctx.beginPath(); ctx.arc(s.selected.nx * w, s.selected.ny * h, 2.2, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    };

    const tick = (t: number) => {
      raf = 0;
      draw(t);
      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const ra = nx * 360;
      const dec = 90 - ny * 180;
      const c = cellOf(ra, dec);
      hover = { ...c, ra, dec, n: s.grid[c.j][c.i], x: nx * s.w, y: ny * s.h, nx, ny };
      cb.current.onHover({ i: c.i, j: c.j, ra, dec, n: s.grid[c.j][c.i], x: nx * s.w, y: ny * s.h });
      kick();
    };
    const leave = () => { hover = null; cb.current.onHover(null); kick(); };
    const click = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      cb.current.onInspect(nx * 360, 90 - ny * 180);
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
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('click', click);
      ro.disconnect();
    };
  }, []);

  return <canvas id="skyCanvas" ref={canvasRef} role="img" aria-label="All-sky coverage map. Use the search box to jump to a field, or click the map to inspect one." />;
}
