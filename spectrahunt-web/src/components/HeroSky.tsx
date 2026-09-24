'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GRID_H, GRID_W, LEVEL_COLORS, cellOf, drawBracket,
  fmtDec, fmtRa, SKY_ALLSKY_URL, SKY_ALLSKY_PREVIEW_URL,
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
    par: { x: number; y: number; tx: number; ty: number };
    sparks: Array<{ x: number; y: number; r: number; ph: number; sp: number }>;
    meteor: { x: number; y: number; vx: number; vy: number; born: number } | null;
    nextMeteorAt: number;
    inView: boolean;
    kb: { ra: number; dec: number; active: boolean };
  }>({ w: 0, h: 0, hover: null, hoverMarker: null, bright: false, selected: null, grid, coverage, img: null, markers,
    par: { x: 0, y: 0, tx: 0, ty: 0 }, sparks: [], meteor: null, nextMeteorAt: 0, inView: true,
    kb: { ra: 180, dec: 0, active: false } });
  const cb = useRef({ onInspect, onMarker });
  useEffect(() => {
    cb.current = { onInspect, onMarker };
    state.current.grid = grid;
    state.current.coverage = coverage;
    state.current.markers = markers;
  });

  // real infrared sky, two-stage: fast preview first, full res after.
  // A loading shimmer covers the cold first paint (no blank confusion).
  useEffect(() => {
    let alive = true;
    void loadCachedImage(SKY_ALLSKY_PREVIEW_URL)
      .then((im) => {
        if (!alive) return;
        state.current.img = im;
        setSkyReady(true);
      })
      .catch(() => undefined);
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
    const TAU = Math.PI * 2;
    let raf = 0;
    let ambient = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const shouldRun = () => st.inView && !reduce.matches && document.visibilityState === 'visible';
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
      // seed twinkles once per size
      if (!st.sparks.length) {
        let s = 20260801;
        const rnd = () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 0xffffffff;
        };
        st.sparks = Array.from({ length: 80 }, () => ({
          x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.4, ph: rnd() * TAU, sp: 0.5 + rnd() * 1.6,
        }));
      }
      const t = nowMs / 1000;
      const live = shouldRun();
      // ease parallax toward pointer target (desktop depth cue)
      st.par.x += (st.par.tx - st.par.x) * 0.06;
      st.par.y += (st.par.ty - st.par.y) * 0.06;
      if (st.img && st.img.complete && st.img.naturalWidth) {
        // cover with horizontal mirror: image RA runs LEFT, overlay math runs RIGHT.
        // The sky itself stays registered (mapping must not move); all motion
        // lives in overlays: parallax, twinkles, and the survey sweep below.
        const iw = st.img.naturalWidth;
        const ih = st.img.naturalHeight;
        const scale = Math.max(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = st.par.x;
        const dy = st.par.y;
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(st.img, (w - dw) / 2 + dx, (h - dh) / 2 + dy, dw, dh);
        ctx.restore();
        // base dim for text contrast; lifts while the user interacts with the sky
        ctx.fillStyle = st.bright ? 'rgba(4,5,10,.1)' : 'rgba(4,5,10,.44)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, w, h);
      }

      // survey sweep band: always drawn (the instrument's motion is the hook);
      // measured-cell glow needs coverage data and layers on top when present.
      const sweepX = live ? (((t * w) / 75 + w * 0.15) % (w * 1.3)) - w * 0.15 : -w;
      const sweepW = Math.max(60, w * 0.09);
      if (live && sweepX > -sweepW && sweepX < w + sweepW) {
        const g = ctx.createLinearGradient(sweepX - sweepW, 0, sweepX + sweepW, 0);
        g.addColorStop(0, 'rgba(124,131,253,0)');
        g.addColorStop(0.5, 'rgba(150,170,255,.10)');
        g.addColorStop(1, 'rgba(124,131,253,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sweepX - sweepW, 0, sweepW * 2, h);
      }
      if (st.coverage) {
        const cw = w / GRID_W;
        const ch = h / GRID_H;
        for (let j = 0; j < GRID_H; j++) {
          for (let i = 0; i < GRID_W; i++) {
            const e = st.grid[j][i];
            if (!e) continue;
            const cx = (i + 0.5) * cw;
            const lit = live ? Math.max(0, 1 - Math.abs(cx - sweepX) / sweepW) : 0;
            const dx = ((i + 0.5) / GRID_W - 0.5) / 0.42;
            const dy = ((j + 0.5) / GRID_H - 0.5) / 0.32;
            const d = Math.min(1, Math.hypot(dx, dy));
            // glow lives mid-frame and dies at the edges (an inverted falloff
            // once drew full-height cell-boundary edges across the hero)
            const att = Math.max(0, 1 - d * d);
            if (att < 0.05) continue;
            ctx.globalAlpha = (0.4 + lit * 0.5) * att;
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
      // keyboard inspection cursor (focus-ring color, distinct from selection)
      if (st.kb.active) {
        ctx.strokeStyle = '#a5acff';
        ctx.lineWidth = 1.5;
        drawBracket(ctx, (st.kb.ra / 360) * w, ((90 - st.kb.dec) / 180) * h, 14, 6);
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
      // twinkling foreground stars
      for (const s of st.sparks) {
        const tw = live ? 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(s.ph + t * s.sp)) : 0.3;
        ctx.fillStyle = `rgba(220,228,245,${tw.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
        ctx.fill();
      }
      // occasional shooting star (ambient only)
      if (live && !st.meteor && nowMs > st.nextMeteorAt) {
        const sx = Math.random() * w * 0.7 + w * 0.15;
        const sy = Math.random() * h * 0.3;
        const ang = Math.PI * (0.72 + Math.random() * 0.1);
        const v = Math.max(w, h) * 0.9;
        st.meteor = { x: sx, y: sy, vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v * 0.4, born: nowMs };
      }
      if (st.meteor) {
        const m = st.meteor;
        const age = (nowMs - m.born) / 750;
        if (age >= 1 || !live) {
          st.meteor = null;
          st.nextMeteorAt = nowMs + 7000 + Math.random() * 8000;
        } else {
          const mx = m.x + m.vx * age * 0.75;
          const my = m.y + m.vy * age * 0.75;
          const tx = mx - m.vx * 0.22;
          const ty = my - m.vy * 0.22;
          const grad = ctx.createLinearGradient(mx, my, tx, ty);
          grad.addColorStop(0, `rgba(238,240,248,${(0.9 * (1 - age)).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(238,240,248,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${(1 - age).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(mx, my, 2.2, 0, TAU);
          ctx.fill();
        }
      }
      // click ripples (finally visible: expanding rings that fade in ~350ms)
      const kept: typeof ripples.current = [];
      for (const r of ripples.current) {
        const age = (nowMs - r.t0) / 350;
        if (age >= 1) continue;
        kept.push(r);
        ctx.strokeStyle = `rgba(124,131,253,${(0.75 * (1 - age)).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + age * 30, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(124,131,253,${(0.4 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + age * 18, 0, TAU);
        ctx.stroke();
      }
      ripples.current = kept;
    };

    // ambient loop: continuous only while visible, un-reduced, and on screen.
    // Otherwise the sky renders on demand exactly like before (zero cost).
    const loop = () => {
      ambient = 0;
      draw(performance.now());
      if (shouldRun()) ambient = requestAnimationFrame(loop);
    };
    const poke = () => {
      if (shouldRun()) {
        if (!ambient) ambient = requestAnimationFrame(loop);
      } else if (!raf) {
        raf = requestAnimationFrame(tick);
      }
    };
    const tick = () => {
      raf = 0;
      draw(performance.now());
    };
    const kick = () => poke();
    const onVis = () => poke();
    document.addEventListener('visibilitychange', onVis);
    const onChange = () => poke();
    reduce.addEventListener?.('change', onChange);
    const io = new IntersectionObserver((es) => {
      st.inView = es.some((e) => e.isIntersecting);
      poke();
    }, { threshold: 0 });
    io.observe(host);

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      // parallax target: opposite drift sells depth (desktop pointers only)
      st.par.tx = (0.5 - nx) * 16;
      st.par.ty = (0.5 - ny) * 12;
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
      st.par.tx = 0; st.par.ty = 0;
      if (tipRef.current) tipRef.current.style.opacity = '0';
      if (tipTimer.current) clearTimeout(tipTimer.current);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY };
    };
    const kickRipple = () => {
      // ripples now render inside the ambient draw; just ensure a frame runs
      poke();
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
    // keyboard parity: arrows move an inspection cursor, Enter/Space inspects
    // (or activates a nearby marker), M jumps to the next marker.
    const onFocus = () => { st.kb.active = true; kick(); };
    const onBlur = () => { st.kb.active = false; kick(); };
    const activateKb = () => {
      const k = st.kb;
      const nx = k.ra / 360;
      const ny = (90 - k.dec) / 180;
      for (const m of st.markers) {
        if (Math.hypot(m.ra / 360 - nx, (90 - m.dec) / 180 - ny) < 0.06 && cb.current.onMarker) {
          cb.current.onMarker(m.id);
          return;
        }
      }
      const r = canvas.getBoundingClientRect();
      st.selected = { nx, ny };
      cb.current.onInspect(k.ra, k.dec, r.left + nx * r.width, r.top + ny * r.height);
      wake();
    };
    const cycleMarker = () => {
      if (!st.markers.length) return;
      let best = 0;
      let bestD = Infinity;
      st.markers.forEach((m, idx) => {
        const d = Math.hypot(m.ra - st.kb.ra, (m.dec - st.kb.dec) * 2);
        if (d < bestD) { bestD = d; best = idx; }
      });
      const next = st.markers[(best + 1) % st.markers.length];
      st.kb.ra = next.ra;
      st.kb.dec = next.dec;
      kick();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 15 : 5;
      let handled = true;
      if (e.key === 'ArrowLeft') st.kb.ra = (((st.kb.ra - step) % 360) + 360) % 360;
      else if (e.key === 'ArrowRight') st.kb.ra = (st.kb.ra + step) % 360;
      else if (e.key === 'ArrowUp') st.kb.dec = Math.min(85, st.kb.dec + step);
      else if (e.key === 'ArrowDown') st.kb.dec = Math.max(-85, st.kb.dec - step);
      else if (e.key === 'Enter' || e.key === ' ') activateKb();
      else if (e.key === 'm' || e.key === 'M') cycleMarker();
      else handled = false;
      if (handled) { e.preventDefault(); kick(); }
    };
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);
    canvas.addEventListener('keydown', onKey);

    layout();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(host);
    poke();
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(ambient);
      if (idleTimer) clearTimeout(idleTimer);
      if (tipTimer.current) clearTimeout(tipTimer.current);
      document.removeEventListener('visibilitychange', onVis);
      reduce.removeEventListener?.('change', onChange);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('click', click);
      canvas.removeEventListener('focus', onFocus);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('keydown', onKey);
      ro.disconnect();
      io.disconnect();
    };
  }, [skyReady]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} id="heroCanvas" role="img" tabIndex={0}
        aria-label="Interactive infrared all-sky image. Arrow keys move the inspection cursor, Enter inspects the field, M jumps between highlighted fields." />
      <div ref={tipRef} className="sky-tip mono" aria-hidden="true" />
      {!skyReady && (
        <div className="hero-loading" aria-hidden="true">
          <span className="hero-loading-dot" />
          <span>Loading real sky…</span>
        </div>
      )}
    </div>
  );
}
