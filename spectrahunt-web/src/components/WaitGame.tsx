'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Drop { x: number; y: number; vy: number; r: number; hue: number; caught: boolean; born: number }

/** Photon Catcher: steer the reticle, catch photons while IRSA frames load.
 *  Pure diversion — auto-dismisses the moment data arrives. Skippable,
 *  keyboard-playable, and static under prefers-reduced-motion. */
export default function WaitGame({ status, onSkipHref = '/sky' }: { status: string; onSkipHref?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const aim = useRef({ x: 0.5, y: 0.6, kx: 0, ky: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = (canvas.width = host.clientWidth * 2);
    const H = (canvas.height = 320);
    canvas.style.height = '160px';
    const drops: Drop[] = [];
    let raf = 0;
    let last = performance.now();

    const spawn = (now: number) => {
      if (drops.length < 14 && Math.random() < 0.09) {
        drops.push({
          x: Math.random() * W, y: -12,
          vy: (60 + Math.random() * 120) * (W / 800),
          r: 3 + Math.random() * 4,
          hue: [45, 150, 210, 265][Math.floor(Math.random() * 4)],
          caught: false, born: now,
        });
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, W, H);
      // starfield
      ctx.fillStyle = 'rgba(238,240,248,.5)';
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 197.3) % 1) * W;
        const sy = ((i * 331.7) % 1) * H;
        ctx.fillRect(sx, sy, 2, 2);
      }
      const a = aim.current;
      // keyboard drift
      a.x = Math.min(1, Math.max(0, a.x + a.kx * dt * 0.9));
      a.y = Math.min(1, Math.max(0, a.y + a.ky * dt * 0.9));
      const ax = a.x * W;
      const ay = a.y * H;

      spawn(now);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (!d.caught) d.y += d.vy * dt;
        const dx = d.x - ax;
        const dy = d.y - ay;
        if (!d.caught && Math.hypot(dx, dy) < 34) {
          d.caught = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
        if (d.caught) {
          const age = (now - d.born) / 300;
          if (age > 1) { drops.splice(i, 1); continue; }
          ctx.strokeStyle = `hsla(${d.hue},90%,70%,${1 - age})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(ax, ay, 10 + age * 26, 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        if (d.y > H + 16) { drops.splice(i, 1); continue; }
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 3);
        g.addColorStop(0, `hsla(${d.hue},90%,72%,.95)`);
        g.addColorStop(1, `hsla(${d.hue},90%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 3, 0, Math.PI * 2); ctx.fill();
      }

      // reticle
      ctx.strokeStyle = '#eef0f8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 32, ay); ctx.lineTo(ax - 12, ay);
      ctx.moveTo(ax + 12, ay); ctx.lineTo(ax + 32, ay);
      ctx.moveTo(ax, ay - 32); ctx.lineTo(ax, ay - 12);
      ctx.moveTo(ax, ay + 12); ctx.lineTo(ax, ay + 32);
      ctx.stroke();
      ctx.fillStyle = '#eef0f8';
      ctx.font = '600 22px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(scoreRef.current), ax, ay + 58);

      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      aim.current.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      aim.current.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    };
    const key = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const s = down ? 1 : 0;
      if (k === 'arrowleft' || k === 'a') aim.current.kx = -s;
      else if (k === 'arrowright' || k === 'd') aim.current.kx = s;
      else if (k === 'arrowup' || k === 'w') aim.current.ky = -s;
      else if (k === 'arrowdown' || k === 's') aim.current.ky = s;
      else return;
      if (down) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    canvas.addEventListener('pointermove', move);
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    if (reduce.matches) {
      // static sky, no loop
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(238,240,248,.5)';
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(((i * 197.3) % 1) * W, ((i * 331.7) % 1) * H, 2, 2);
      }
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', move);
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
    };
  }, []);

  return (
    <div className="waitgame glass" aria-hidden="true">
      <div className="waitgame-head">
        <span className="mono">{status}</span>
        <span className="mono waitgame-score">{score} caught</span>
      </div>
      <canvas ref={canvasRef} />
      <div className="waitgame-foot">
        <span>Steer with mouse, touch, or arrows — catch photons while the frames arrive.</span>
        <Link href={onSkipHref} className="epoch-chip">Skip wait</Link>
      </div>
      <p className="sr-only" role="status">Loading field data. Game progress is decorative.</p>
    </div>
  );
}
