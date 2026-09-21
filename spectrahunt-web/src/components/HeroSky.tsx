'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GRID_H, GRID_W, LEVEL_COLORS, cellOf, drawBracket,
  fmtDec, fmtRa, SKY_ALLSKY_URL,
} from '@/lib/sky';
import { loadCachedImage } from '@/lib/skycache';

export interface SkyHover { i: number; j: number; ra: number; dec: number; n: number; x: number; y: number }

/** Full-page hero sky: REAL 2MASS infrared all-sky image + coverage tint + click-to-inspect. */
export interface HeroMarker { id: string; ra: number; dec: number }
export default function HeroSky({
  grid, coverage, onInspect, markers = [], onMarker,
}: {
  grid: number[][]; coverage: boolean;
  onInspect: (ra: number, dec: number, x: number, y: number) => void;
  markers?: HeroMarker[];
  onMarker?: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const ripples = useRef<Array<{ x: number; y: number; t0: number }>>([]);
  const rippleRaf = useRef(0);
  const [skyReady, setSkyReady] = useState(false);
  const state = useRef<{
    w: number; h: number;
    hover: (SkyHover & { nx: number; ny: number }) | null;
    hoverMarker: string | null;
    bright: boolean;
    selected: { nx: number; ny: number } | null;
    grid: number[][]; coverage: boolean;
    img: HTMLImageElement | null;
    markers: HeroMarker[];
  }>({ w: 0, h: 0, hover: null, hoverMarker: null, bright: false, selected: null, grid, coverage, img: null, markers });
  const cb = useRef({ onInspect, onMarker });
  useEffect(() => {
    cb.current = { onInspect, onMarker };
    state.current.grid = grid;
    state.current.coverage = coverage;
    state.current.markers = markers;
  });

  // real infrared sky (2MASS all-sky CAR, cached on device)
  useEffect(() => {
    let alive = true;
    void loadCachedImage(SKY_ALLSKY_URL)
      .then((im) => {
        if (!alive) return;
        state.current.img = im;
        setSkyReady(true);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = state.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      st.bright = true;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { st.bright = false; kick(); }, 2500);
      kick();
    };

    const layout = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.w = w; st.h = h;
    };

    const draw = (nowMs = 0) => {
      const { w, h } = st;
      if (!w || !h) return;
      if (st.img && st.img.complete && st.img.naturalWidth) {
        // cover with horizontal mirror: image RA runs LEFT, overlay math runs RIGHT
        const iw = st.img.naturalWidth;
        const ih = st.img.naturalHeight;
        const scale = Math.max(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(st.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ctx.restore();
        // base dim for text contrast; lifts while the user interacts with the sky
        ctx.fillStyle = st.bright ? 'rgba(4,5,10,.06)' : 'rgba(4,5,10,.30)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, w, h);
      }

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
      // blinkable-field markers: tiny unlabeled dots; label is a hover tooltip only
      ctx.textBaseline = 'middle';
      for (const m of st.markers) {
        const mx = (m.ra / 360) * w;
        const my = ((90 - m.dec) / 180) * h;
        const isHov = st.hoverMarker === m.id;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, isHov ? 20 : 13);
        g.addColorStop(0, isHov ? 'rgba(124,131,253,.9)' : 'rgba(124,131,253,.4)');
        g.addColorStop(1, 'rgba(124,131,253,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mx, my, isHov ? 20 : 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(mx, my, isHov ? 3.5 : 2.2, 0, Math.PI * 2); ctx.fill();
        if (isHov) {
          ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
          ctx.textAlign = mx > w - 130 ? 'right' : 'left';
          const label = m.id.replace(/-/g, ' ');
          const lx = mx + (mx > w - 130 ? -12 : 12);
          const twd = ctx.measureText(label).width;
          const bx = mx > w - 130 ? lx - twd - 6 : lx - 6;
          ctx.fillStyle = 'rgba(5,6,12,.85)';
          ctx.fillRect(bx, my - 22, twd + 12, 20);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, lx, my - 12);
          ctx.textAlign = 'left';
        }
      }
    };

    const tick = () => {
      raf = 0;
      draw(performance.now());
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
      // marker tooltip target (hover affordance doubles as the click hint)
      let found: string | null = null;
      for (const m of st.markers) {
        const mx = (m.ra / 360) * r.width;
        const my = ((90 - m.dec) / 180) * r.height;
        if (Math.hypot(e.clientX - r.left - mx, e.clientY - r.top - my) < 18) { found = m.id; break; }
      }
      st.hoverMarker = found;
      canvas.style.cursor = found ? 'pointer' : 'crosshair';
      // reticle tooltip pill (delayed fade-in via CSS, positioned by.CLIENT coords)
      const tip = tipRef.current;
      if (tip) {
        tip.textContent = found
          ? found.replace(/-/g, ' ')
          : `RA ${fmtRa(ra)}  Dec ${fmtDec(dec)}`;
        tip.style.opacity = '0';
        tip.style.left = `${Math.min(r.width - 150, e.clientX - r.left + 16)}px`;
        tip.style.top = `${Math.max(8, e.clientY - r.top - 14)}px`;
        if (tipTimer.current) clearTimeout(tipTimer.current);
        tipTimer.current = setTimeout(() => { if (tipRef.current) tipRef.current.style.opacity = '1'; }, 150);
      }
      wake();
    };
    const leave = () => {
      st.hover = null; st.hoverMarker = null;
      if (tipRef.current) tipRef.current.style.opacity = '0';
      if (tipTimer.current) clearTimeout(tipTimer.current);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY };
    };
    const kickRipple = () => {
      if (rippleRaf.current) return;
      const step = () => {
        rippleRaf.current = 0;
        if (ripples.current.length) {
          draw(performance.now());
          rippleRaf.current = requestAnimationFrame(step);
        }
      };
      rippleRaf.current = requestAnimationFrame(step);
    };
    const click = (e: MouseEvent) => {
      // drag (>5px) is a pan gesture, not a click
      if (downPos.current && Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) > 5) return;
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      // click ripple (~300ms), skipped under reduced motion
      if (!reduce.matches) {
        ripples.current.push({ x: nx * st.w, y: ny * st.h, t0: performance.now() });
        kickRipple();
      }
      // markers first: jump straight into the blink
      for (const m of st.markers) {
        const mx = (m.ra / 360) * r.width;
        const my = ((90 - m.dec) / 180) * r.height;
        if (Math.hypot(e.clientX - r.left - mx, e.clientY - r.top - my) < 18 && cb.current.onMarker) {
          cb.current.onMarker(m.id);
          return;
        }
      }
      st.selected = { nx, ny };
      cb.current.onInspect(nx * 360, 90 - ny * 180, e.clientX, e.clientY);
      wake();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('click', click);

    layout();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(host);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rippleRaf.current);
      if (idleTimer) clearTimeout(idleTimer);
      if (tipTimer.current) clearTimeout(tipTimer.current);
      document.removeEventListener('visibilitychange', onVis);
      reduce.removeEventListener?.('change', onChange);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('click', click);
      ro.disconnect();
    };
  }, [skyReady]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} id="heroCanvas" aria-hidden="true" />
      <div ref={tipRef} className="sky-tip mono" aria-hidden="true" />
    </div>
  );
}
