'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  killScore, layoutWave, marchSpeed, overlap, PLAYER, SLOT, SPRITE_PX, textWidth,
  glyphOf, type Alien,
} from '@/lib/invaders';

interface Bullet { x: number; y: number; w: number; h: number; vy: number; foe: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface FloatText { x: number; y: number; text: string; life: number }

const PX = SPRITE_PX; // sprite pixel size (single source in invaders.ts)

function drawSprite(
  ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string,
) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== ' ' && ch !== '.') ctx.fillRect(Math.round(x + c * PX), Math.round(y + r * PX), PX, PX);
    }
  }
}

/** Chunky bitmap text (offline-safe pixel font). Returns width drawn. */
function drawPixelText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string,
): number {
  const s = text.toUpperCase();
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of s) {
    const g = glyphOf(ch);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] !== ' ') ctx.fillRect(cx + c * scale, Math.round(y) + r * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
  return textWidth(s) * scale;
}

/** Tiny square-wave synth (created on first gesture; mutable). */
function useBleeps(mutedRef: React.MutableRefObject<boolean>) {
  const ac = useRef<AudioContext | null>(null);
  const ensure = () => {
    if (!ac.current) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        ac.current = new AC();
      } catch { /* no audio */ }
    }
    if (ac.current?.state === 'suspended') void ac.current.resume().catch(() => undefined);
    return ac.current;
  };
  const tone = useCallback((f0: number, f1: number, dur: number, vol = 0.05) => {
    if (mutedRef.current) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f0, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* noop */ }
  }, [mutedRef]);
  const noise = useCallback((dur = 0.18, vol = 0.07) => {
    if (mutedRef.current) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = vol;
      src.connect(g).connect(ctx.destination);
      src.start();
    } catch { /* noop */ }
  }, [mutedRef]);
  useEffect(() => () => {
    try { void ac.current?.close(); } catch { /* noop */ }
  }, []);
  return { tone, noise };
}

/** STELLAR Invaders: hold the line while IRSA frames load.
 *  Pure diversion — auto-dismisses the moment data arrives. Endless waves,
 *  3 shields, mutable bleeps, static under prefers-reduced-motion. */
export default function WaitGame({ status, headline = 'Fetching live sky data', onSkipHref = '/sky' }: {
  status: string;
  headline?: string;
  onSkipHref?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, wave: 1, shields: 3, best: 0 });
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  // mirror mute flag for the audio callbacks (synced in an effect, never during render)
  useEffect(() => {
    mutedRef.current = muted;
  });
  const { tone, noise } = useBleeps(mutedRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // persistent best (session kindly degrades to 0)
    let best = 0;
    try { best = Number(localStorage.getItem('sh-invaders-best') ?? 0) || 0; } catch { /* noop */ }

    const S = {
      aliens: [] as Alien[],
      bullets: [] as Bullet[],
      foes: [] as Bullet[],
      parts: [] as Particle[],
      floats: [] as FloatText[],
      stars: [] as { x: number; y: number; sp: number }[],
      px: 0.5, dir: 1, wave: 1, score: 0, shields: 3, streak: 0,
      lastShot: 0, lastFoe: 0, shake: 0, invulnUntil: 0,
      firing: false, space: false,
      keys: { left: false, right: false },
      w: 0, h: 0,
    };
    const syncHud = () => setHud({ score: S.score, wave: S.wave, shields: S.shields, best: Math.max(best, S.score) });
    const saveBest = () => {
      if (S.score > best) {
        best = S.score;
        try { localStorage.setItem('sh-invaders-best', String(best)); } catch { /* noop */ }
      }
    };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    fit();
    const seedStars = () => {
      let s = 987654321;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
      S.stars = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd(), sp: 12 + rnd() * 40 }));
    };
    seedStars();

    const cell = () => Math.max(10, Math.min(16, S.w / 60));
    const startWave = () => {
      const c = cell();
      S.aliens = layoutWave(S.wave, S.w);
      const margin = Math.max(24, S.w * 0.08);
      const cols = Math.max(...S.aliens.map((a) => a.col)) + 1;
      const gw = cols * SLOT;
      const ox = (S.w - gw) / 2;
      for (const a of S.aliens) {
        a.x = ox + a.col * SLOT + (SLOT - a.w) / 2;
        a.y = margin + 40 + a.row * (a.h + c * 0.7);
      }
      syncHud();
    };

    const boom = (x: number, y: number, color: string, n = 14) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 40 + Math.random() * 160;
        S.parts.push({
          x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
          life: 0.5 + Math.random() * 0.4, color,
        });
      }
    };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      S.w = canvas.width / dpr;
      S.h = canvas.height / dpr;
    };
    size();

    let raf = 0;
    let last = performance.now();
    let hudTimer = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      try {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = S.w;
        const H = S.h;
        if (!W || !H) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // shake (skipped under reduced motion)
        const shx = !reduce.matches && S.shake > 0 ? (Math.random() - 0.5) * S.shake * 14 : 0;
        const shy = !reduce.matches && S.shake > 0 ? (Math.random() - 0.5) * S.shake * 14 : 0;
        S.shake = Math.max(0, S.shake - dt * 2.2);
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(shx, shy);

        // starfield drift
        ctx.fillStyle = 'rgba(220,228,245,.6)';
        for (const st of S.stars) {
          const y = reduce.matches ? st.y * H : ((st.y * H + now / 1000 * st.sp) % H);
          ctx.fillRect(st.x * W, y, 2, 2);
        }

        // player
        const pw = PLAYER[0].length * PX;
        const ph = PLAYER.length * PX;
        const px = S.px * W;
        const py = H - 56;
        const blink = now < S.invulnUntil && Math.floor(now / 120) % 2 === 0;
        if (!blink) drawSprite(ctx, PLAYER, px - pw / 2, py - ph / 2, '#7cfc9a');
        if (S.keys.left) S.px = Math.max(0.04, S.px - dt * 0.55);
        if (S.keys.right) S.px = Math.min(0.96, S.px + dt * 0.55);

        // player fire (rate-limited)
        if ((S.firing || S.space) && now - S.lastShot > 220) {
          S.lastShot = now;
          S.bullets.push({ x: px - 2, y: py - ph / 2 - 8, w: 4, h: 10, vy: -520, foe: false });
          tone(880, 440, 0.08);
        }

        // bullets
        ctx.fillStyle = '#ffe66d';
        for (const b of S.bullets) {
          b.y += b.vy * dt;
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        S.bullets = S.bullets.filter((b) => b.y > -20);

        // invader march
        const alive = S.aliens.filter((a) => a.alive);
        const sp = marchSpeed(S.wave, alive.length, S.aliens.length);
        let drop = false;
        for (const a of alive) {
          a.x += S.dir * sp * dt;
          if (a.x < 8 || a.x + a.w > W - 8) drop = true;
        }
        if (drop) {
          S.dir *= -1;
          for (const a of alive) a.y += 14;
        }
        // breach line: invaders reaching the cannon reset the wave (no death spiral)
        if (alive.some((a) => a.y + a.h > py - ph / 2)) {
          for (const a of S.aliens) a.alive = true;
          S.dir = 1;
          const margin = Math.max(24, W * 0.08);
          const c = cell();
          for (const a of S.aliens) {
            const cols = Math.max(...S.aliens.map((q) => q.col)) + 1;
            const gw = cols * SLOT;
            a.x = (W - gw) / 2 + a.col * SLOT + (SLOT - a.w) / 2;
            a.y = margin + 40 + a.row * (a.h + c * 0.7);
          }
          S.streak = 0;
        }

        // alien fire
        if (alive.length && now - S.lastFoe > Math.max(380, 1100 - S.wave * 90)) {
          S.lastFoe = now;
          const shooters = alive.filter((a) => !alive.some((o) => o.col === a.col && o.row > a.row));
          const s = shooters[Math.floor(Math.random() * shooters.length)];
          if (s) S.foes.push({ x: s.x + s.w / 2 - 2, y: s.y + s.h, w: 4, h: 10, vy: 200 + S.wave * 18, foe: true });
        }
        ctx.fillStyle = '#ff6b81';
        for (const b of S.foes) {
          b.y += b.vy * dt;
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        S.foes = S.foes.filter((b) => b.y < H + 20);

        // hits: player bullets vs aliens
        const frameNo = Math.floor(now / 450) % 2;
        for (const b of S.bullets) {
          for (const a of alive) {
            if (!a.alive) continue;
            if (overlap(b, a)) {
              a.alive = false;
              b.y = -9999;
              const g = killScore(a.score, S.streak);
              S.score += g;
              S.streak += 1;
              S.floats.push({ x: a.x + a.w / 2, y: a.y, text: `+${g}`, life: 0.9 });
              boom(a.x + a.w / 2, a.y + a.h / 2, a.color);
              noise(0.16);
              break;
            }
          }
        }
        // hits: foe bullets vs player
        if (now > S.invulnUntil) {
          const ship = { x: px - pw / 2, y: py - ph / 2, w: pw, h: ph };
          for (const b of S.foes) {
            if (overlap(b, ship)) {
              b.y = H + 999;
              S.shields -= 1;
              S.streak = 0;
              S.invulnUntil = now + 1500;
              S.shake = 1;
              boom(px, py, '#7cfc9a', 22);
              noise(0.3, 0.1);
              saveBest();
              syncHud();
              break;
            }
          }
        }
        // wave cleared
        if (alive.length && alive.every((a) => !a.alive)) {
          S.score += 500;
          S.wave += 1;
          S.floats.push({ x: W / 2, y: H / 2, text: `WAVE ${S.wave}`, life: 1.6 });
          tone(440, 880, 0.25);
          startWave();
          saveBest();
          syncHud();
        }

        // draw aliens
        for (const a of S.aliens) {
          if (!a.alive) continue;
          drawSprite(ctx, a.sprite[frameNo % a.sprite.length], a.x, a.y, a.color);
        }
        // particles + floats
        for (const p of S.parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 260 * dt;
          p.life -= dt;
          if (p.life > 0) {
            ctx.globalAlpha = Math.min(1, p.life * 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
            ctx.globalAlpha = 1;
          }
        }
        S.parts = S.parts.filter((p) => p.life > 0);
        ctx.textBaseline = 'top';
        for (const f of S.floats) {
          f.life -= dt;
          f.y -= 26 * dt;
          if (f.life > 0) drawPixelText(ctx, f.text, f.x - (textWidth(f.text) * 2) / 2, f.y, 2, '#ffe66d');
        }
        S.floats = S.floats.filter((f) => f.life > 0);
        ctx.restore();

        hudTimer += dt;
        if (hudTimer > 0.5) {
          hudTimer = 0;
          syncHud();
        }
      } catch { /* best-effort pixels */ }
    };

    startWave();
    syncHud();
    raf = requestAnimationFrame(frame);

    const toUnitMove = (cx: number) => {
      const r = canvas.getBoundingClientRect();
      S.px = Math.min(0.96, Math.max(0.04, (cx - r.left) / r.width));
      S.firing = true;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') S.keys.left = true;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') S.keys.right = true;
      else if (e.key === ' ') { S.space = true; e.preventDefault(); }
      else return;
      e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') S.keys.left = false;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') S.keys.right = false;
      else if (e.key === ' ') S.space = false;
    };
    const up = () => { S.firing = false; };
    const vis = () => { last = performance.now(); };
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.buttons === 0) return;
      toUnitMove(e.clientX);
    });
    canvas.addEventListener('pointerdown', (e) => toUnitMove(e.clientX));
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      saveBest();
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('keydown', kd);
      document.removeEventListener('keyup', ku);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('resize', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="waitgame glass">
      <div className="waitgame-head">
        <div className="waitgame-load">
          <span className="waitgame-title"><span className="pulse-dot" aria-hidden="true" />{headline}</span>
          <span className="mono">{status}</span>
        </div>
        <span className="mono waitgame-score">
          {hud.score} pts · W{hud.wave} · {'●'.repeat(Math.max(0, hud.shields))}{'○'.repeat(Math.max(0, 3 - hud.shields))} · best {hud.best}
        </span>
      </div>
      <canvas
        ref={canvasRef} role="img"
        aria-label="Space defense game: move with arrows or drag, shoot with Space. Destroy the invaders while frames load."
      />
      <div className="waitgame-foot">
        <span>While you wait — hold the line: arrows/drag to move, Space/touch to fire.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="epoch-chip" onClick={() => setMuted((m) => !m)}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <Link href={onSkipHref} className="epoch-chip">Skip wait</Link>
        </span>
      </div>
      <p className="sr-only" role="status">Loading field data. Game progress is decorative.</p>
    </div>
  );
}
