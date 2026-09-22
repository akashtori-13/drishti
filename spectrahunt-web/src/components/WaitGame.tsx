'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FIGURES, initialPlay, nodeAt, scoreLine, tapNode, type PlayState,
} from '@/lib/constellations';

interface Twinkle { x: number; y: number; r: number; ph: number; sp: number }

/** Constellation Rush: trace real asterisms while IRSA frames load.
 *  Pure diversion — auto-dismisses the moment data arrives. Hintable,
 *  skippable, keyboard-playable, and static under prefers-reduced-motion. */
export default function WaitGame({ status, headline = 'Fetching live sky data', onSkipHref = '/sky' }: {
  status: string;
  headline?: string;
  onSkipHref?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [play, setPlay] = useState<PlayState>(initialPlay);
  const [fact, setFact] = useState<string | null>(null);
  const playRef = useRef(play);
  // mirror latest play state for canvas callbacks (synced in an effect, never during render)
  useEffect(() => {
    playRef.current = play;
  });
  const aim = useRef({ x: 0.5, y: 0.55, kx: 0, ky: 0 });
  const stars = useRef<Twinkle[] | null>(null);
  const factTimer = useRef(0);
  const hintAtRef = useRef(0);

  const doTap = useCallback((ux: number, uy: number) => {
    const s = playRef.current;
    const fig = FIGURES[s.figureIdx % FIGURES.length];
    const i = nodeAt(fig, ux, uy);
    if (i < 0) {
      const r = tapNode(s, -1);
      setPlay(r.state);
      return;
    }
    const r = tapNode(s, i);
    setPlay(r.state);
    if (r.result.kind === 'hit' && r.result.complete) {
      setFact(fig.fact);
      window.clearTimeout(factTimer.current);
      factTimer.current = window.setTimeout(() => setFact(null), 2600);
    }
  }, []);

  const hint = useCallback(() => {
    setPlay((s) => {
      if (s.score < 50) return s;
      return { ...s, score: s.score - 50 };
    });
    hintAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const TAU = Math.PI * 2;
    if (!stars.current) {
      let seed = 1234567;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
      stars.current = Array.from({ length: 130 }, () => ({
        x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.6, ph: rnd() * TAU, sp: 0.4 + rnd() * 1.2,
      }));
    }
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    fit();
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const t = reduce.matches ? 0 : (performance.now() - t0) / 1000;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const S = Math.min(w, h);
        const ox = (w - S) / 2;
        const oy = (h - S) / 2;
        const X = (u: number) => ox + u * S;
        const Y = (u: number) => oy + u * S;
        // twinkling field
        for (const s of stars.current ?? []) {
          const tw = reduce.matches ? 0.55 : 0.35 + 0.3 * Math.sin(s.ph + t * s.sp);
          ctx.fillStyle = `rgba(220,228,245,${tw.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(X(s.x), Y(s.y), s.r, 0, TAU);
          ctx.fill();
        }
        // current figure
        const ps = playRef.current;
        const fig = FIGURES[ps.figureIdx % FIGURES.length];
        // visited links (prefix through the next target)
        ctx.strokeStyle = 'rgba(124,131,253,.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= ps.hitIdx && i < fig.nodes.length; i++) {
          const n = fig.nodes[i];
          if (i === 0) ctx.moveTo(X(n.x), Y(n.y));
          else ctx.lineTo(X(n.x), Y(n.y));
        }
        ctx.stroke();
        // nodes
        fig.nodes.forEach((n, i) => {
          const px = X(n.x);
          const py = Y(n.y);
          const visited = i < ps.hitIdx;
          const current = i === ps.hitIdx;
          const hinted = current && performance.now() - hintAtRef.current < 900;
          if (current) {
            const pulse = reduce.matches ? 0 : Math.sin(t * 4) * 3;
            ctx.strokeStyle = '#eef0f8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, 14 + pulse + (hinted ? 8 : 0), 0, TAU);
            ctx.stroke();
            ctx.fillStyle = 'rgba(238,240,248,.95)';
            ctx.font = '12px system-ui';
            ctx.fillText(n.name, px + 18, py + 4);
          }
          ctx.fillStyle = visited ? '#7c83fd' : current ? '#ffffff' : 'rgba(170,180,210,.5)';
          ctx.beginPath();
          ctx.arc(px, py, visited || current ? 5 : 3.5, 0, TAU);
          ctx.fill();
        });
        // reticle
        const rx = X(aim.current.x);
        const ry = Y(aim.current.y);
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - 12, ry); ctx.lineTo(rx + 12, ry);
        ctx.moveTo(rx, ry - 12); ctx.lineTo(rx, ry + 12);
        ctx.stroke();
      } catch { /* best-effort pixels */ }
    };
    draw();
    const toUnit = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      void dpr;
      const w = r.width;
      const h = r.height;
      const S = Math.min(w, h);
      return { x: (cx - r.left - (w - S) / 2) / S, y: (cy - r.top - (h - S) / 2) / S };
    };
    const tap = (cx: number, cy: number) => {
      const p = toUnit(cx, cy);
      if (p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1) return;
      doTap(Math.min(1, Math.max(0, p.x)), Math.min(1, Math.max(0, p.y)));
    };
    const move = (e: PointerEvent) => {
      const p = toUnit(e.clientX, e.clientY);
      aim.current.x = Math.min(1, Math.max(0, p.x));
      aim.current.y = Math.min(1, Math.max(0, p.y));
    };
    const kd = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.03;
      if (e.key === 'ArrowLeft') aim.current.x = Math.max(0, aim.current.x - step);
      else if (e.key === 'ArrowRight') aim.current.x = Math.min(1, aim.current.x + step);
      else if (e.key === 'ArrowUp') aim.current.y = Math.max(0, aim.current.y - step);
      else if (e.key === 'ArrowDown') aim.current.y = Math.min(1, aim.current.y + step);
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doTap(aim.current.x, aim.current.y);
      } else return;
      e.preventDefault();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', (e) => tap(e.clientX, e.clientY));
    document.addEventListener('keydown', kd);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(factTimer.current);
      canvas.removeEventListener('pointermove', move);
      document.removeEventListener('keydown', kd);
      window.removeEventListener('resize', fit);
    };
  }, [doTap]);

  const fig = FIGURES[play.figureIdx % FIGURES.length];
  return (
    <div className="waitgame glass">
      <div className="waitgame-head">
        <div className="waitgame-load">
          <span className="waitgame-title"><span className="pulse-dot" aria-hidden="true" />{headline}</span>
          <span className="mono">{status}</span>
        </div>
        <span className="mono waitgame-score">{scoreLine(play)}</span>
      </div>
      <canvas
        ref={canvasRef} role="img"
        aria-label={`Connect ${fig.name}: tap star ${play.hitIdx + 1} of ${fig.nodes.length}`}
      />
      <div className="waitgame-foot">
        <span>While you wait — trace {fig.name} ({play.hitIdx}/{fig.nodes.length}): tap, arrows + Enter, or the Hint (−50).</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="epoch-chip" onClick={hint} disabled={play.score < 50}>Hint</button>
          <Link href={onSkipHref} className="epoch-chip">Skip wait</Link>
        </span>
      </div>
      {fact && <p className="waitgame-fact" role="status">{fact}</p>}
      <p className="sr-only" role="status">Loading field data. Game progress is decorative.</p>
    </div>
  );
}
