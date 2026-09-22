'use client';

// Act 1 of the BORESIGHT orbital intro (docs/ORBITAL_INTRO.md): a live
// surveillance-room frame — the real SPHEREx circling a real Earth on its
// real TLE, a dim swarm of tracked neighbours, mono telemetry, one invitation.
// Canvas 2D only; Earth/sprite textures are bundled webp (offline-safe).
// Every number comes from lib/orbit.ts (SGP4) or is labeled (approx).

import { useEffect, useRef, useState } from 'react';
import {
  eciToGeo,
  epochDate,
  nowJD,
  orthoProject,
  propagate,
  sunScreenAxis,
  telemetryFor,
  type OrthoView,
  type PreparedSat,
  type Telemetry,
} from '@/lib/orbit';
import { drawBracket, genStars, STAR_FILL } from '@/lib/sky';

export interface OrbitalIntroProps {
  swarm: PreparedSat[];
  /** Hero screen point (CSS px) is passed so Act 2 can punch through it. */
  onEnter: (focus?: { x: number; y: number }) => void;
  onSkip: () => void;
  earthDay?: string;
  earthNight?: string;
  earthClouds?: string;
  craftSprite?: string;
  craftPoster?: string;
}

interface Pick {
  kind: 'hero' | 'sat';
  x: number;
  y: number;
  name: string;
  si: number;
}

interface Scene {
  w: number;
  h: number;
  dpr: number;
  cx: number;
  cy: number;
  R: number;
  compact: boolean;
  reduced: boolean;
  view: OrthoView;
  driftT: number;
  imgs: Record<'day' | 'night' | 'clouds' | 'sheet' | 'poster', HTMLImageElement | null>;
  imgOk: Record<'day' | 'night' | 'clouds' | 'sheet' | 'poster', boolean>;
  earth: HTMLCanvasElement | null;
  earthKey: string;
  stars: HTMLCanvasElement | null;
  frames: number; // sprite frames detected in the sheet
  picks: Pick[];
  hero: { x: number; y: number; r: number } | null;
  hover: Pick | null;
  nudge: { x0: number; y0: number; x1: number; y1: number; t0: number } | null;
  sats: Array<{ x: number; y: number; visible: boolean; name: string; hero: boolean }>;
  trail: Array<{ x: number; y: number }>;
  twinkle: Array<{ x: number; y: number; r: number; ci: number; b: number; ph: number; sp: number }>;
  raf: number;
  earthFade: number;
  // Time-warp: the sim runs 60x real time (planetarium-style) so the orbit
  // and the rotating Earth are visible. The HUD clock shows sim time and is
  // labeled — TLE age stays on the real clock. Reduced motion: warp 1.
  warp: number;
  ms0: number;
  jd0: number;
  hudTimer: ReturnType<typeof setInterval> | null;
  alive: boolean;
}

const SHEET_COLS = 8;
const SHEET_FRAMES = 48;
const TRAIL_MIN = 40;
const TRAIL_STEP = 2;

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fmtLat(v: number): string {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
}

function fmtLon(v: number): string {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;
}

export default function OrbitalIntro({
  swarm,
  onEnter,
  onSkip,
  earthDay = '/orbital/earth_day.webp',
  earthNight = '/orbital/earth_night.webp',
  earthClouds = '/orbital/earth_clouds.webp',
  craftSprite = '/orbital/spherex_turntable.webp',
  craftPoster = '/orbital/poster.webp',
}: OrbitalIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onEnter, onSkip });
  const swarmRef = useRef(swarm);
  useEffect(() => {
    cb.current = { onEnter, onSkip };
    swarmRef.current = swarm;
  });
  const [hud, setHud] = useState<Telemetry | null>(null);
  const [norad, setNorad] = useState<{ norad: number; cospar: string; epochDoy: string } | null>(null);
  const [count, setCount] = useState(swarm.length);
  const [whisper, setWhisper] = useState<string | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [warp, setWarp] = useState(60);

  // Esc skips from first paint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current.onSkip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S: Scene = {
      w: 0, h: 0, dpr: 1, cx: 0, cy: 0, R: 100, compact: false,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      view: { latC: 14, lonC: 88 },
      driftT: Math.random() * 1000,
      imgs: { day: null, night: null, clouds: null, sheet: null, poster: null },
      imgOk: { day: false, night: false, clouds: false, sheet: false, poster: false },
      earth: null, earthKey: '', stars: null, frames: SHEET_FRAMES,
      picks: [], hero: null, hover: null, nudge: null,
      sats: [], trail: [], twinkle: [], raf: 0, earthFade: 1, hudTimer: null, alive: true,
      warp: 60, ms0: Date.now(), jd0: nowJD(),
    };
    if (S.reduced) S.warp = 1;

    // Simulated Julian date: real clock × warp. Positions, trail, clouds and
    // the HUD clock all read this — one time source, no drift between layers.
    const simJD = () => S.jd0 + ((Date.now() - S.ms0) / 86400000) * S.warp;

    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onReduced = () => {
      S.reduced = reducedMq.matches;
      S.earthKey = ''; // force one static rebuild
      kick(true);
    };
    reducedMq.addEventListener('change', onReduced);

    const kick = (force = false) => {
      if (!S.alive || S.raf) return;
      if (S.reduced && !force && S.earth) return; // static frame stands
      S.raf = requestAnimationFrame((t) => {
        frame(t / 1000);
      });
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      S.w = Math.max(1, rect.width);
      S.h = Math.max(1, rect.height);
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(S.w * S.dpr);
      canvas.height = Math.round(S.h * S.dpr);
      S.cx = S.w * 0.5;
      S.cy = S.h * 0.8;
      S.R = Math.min(S.w, S.h) * (S.w < 640 ? 0.8 : 0.64);
      S.compact = S.w < 640;
      S.earthKey = '';
      buildStars();
      kick(true);
    };

    const buildStars = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(S.w / 2));
      c.height = Math.max(1, Math.round(S.h / 2));
      const g = c.getContext('2d');
      if (!g) return;
      const pts = genStars(63182, S.compact ? 90 : 220);
      S.twinkle = [];
      for (const p of pts) {
        g.globalAlpha = 0.25 + p.b * 0.5;
        g.fillStyle = STAR_FILL[p.ci % STAR_FILL.length];
        const r = p.r * 0.7;
        const px = p.x * c.width;
        const py = p.y * c.height;
        g.fillRect(px, py, r, r);
        if (S.twinkle.length < 48 && p.b > 0.55) {
          S.twinkle.push({
            x: (px / c.width) * S.w,
            y: (py / c.height) * S.h,
            r: r * (S.w / c.width),
            ci: p.ci,
            b: p.b,
            ph: (p.x * 39.7 + p.y * 17.3) % (Math.PI * 2),
            sp: 0.9 + p.b * 1.8,
          });
        }
      }
      S.stars = c;
    };

    // Earth disc layer: day texture + drifting clouds + night texture cut by
    // a terminator mask derived from the real Sun direction. Rebuilt only
    // when sun/camera/drift move materially (quantized key).
    const buildEarth = (jd: number) => {
      const { R } = S;
      const pad = Math.ceil(R * 0.14);
      const size = Math.ceil(2 * (R + pad));
      const sun = sunScreenAxis(jd, S.view);
      const drift = (jd * 15) % 360; // cloud drift, deg of longitude
      const key = `${Math.round(R)}:${S.view.latC.toFixed(1)}:${S.view.lonC.toFixed(1)}:${sun.depth.toFixed(2)}:${sun.ax.toFixed(2)}:${(drift - (drift % 1)).toFixed(0)}`;
      if (S.earth && S.earthKey === key) return;
      S.earthKey = key;
      const layer = S.earth ?? document.createElement('canvas');
      layer.width = size;
      layer.height = size;
      const g = layer.getContext('2d');
      if (!g) return;
      const dc = size / 2; // disc center in layer coords
      const drawTex = (img: HTMLImageElement | null, alpha: number, lonOff: number) => {
        if (!img) return;
        g.save();
        g.globalAlpha = alpha;
        g.beginPath();
        g.arc(dc, dc, R, 0, Math.PI * 2);
        g.clip();
        const scale = (2 * R) / img.height;
        const dw = img.width * scale;
        const dx = dc - R - (((S.view.lonC + lonOff + 180) % 360) / 360) * dw;
        g.drawImage(img, dx, dc - R, dw, 2 * R);
        g.restore();
      };
      if (S.imgOk.day) {
        drawTex(S.imgs.day, 1, 0);
      } else {
        // honest fallback: gradient marble, numbers stay real
        const fg = g.createRadialGradient(dc - R * 0.3, dc - R * 0.3, R * 0.1, dc, dc, R);
        fg.addColorStop(0, '#101c44');
        fg.addColorStop(1, '#04050a');
        g.save();
        g.beginPath();
        g.arc(dc, dc, R, 0, Math.PI * 2);
        g.clip();
        g.fillStyle = fg;
        g.fillRect(dc - R, dc - R, 2 * R, 2 * R);
        g.restore();
      }
      if (S.imgOk.clouds) {
        // cloud plate is white-bg/dark-cloud: invert to black-bg/white-cloud,
        // then add light — clouds glow instead of smudging the blues.
        // A whisper of blur melts the webp compression blocks into atmosphere.
        g.save();
        g.globalCompositeOperation = 'lighter';
        try {
          g.filter = 'invert(1) blur(2px)';
        } catch {
          /* older canvas: fall through with soft alpha */
        }
        drawTex(S.imgs.clouds, 0.22, drift);
        try {
          g.filter = 'none';
        } catch {
          /* noop */
        }
        g.restore();
      }
      if (S.imgOk.night && S.imgs.night) {
        const night = document.createElement('canvas');
        night.width = size;
        night.height = size;
        const ng = night.getContext('2d');
        if (ng) {
          ng.save();
          ng.beginPath();
          ng.arc(dc, dc, R, 0, Math.PI * 2);
          ng.clip();
          const img = S.imgs.night;
          const scale = (2 * R) / img.height;
          const dw = img.width * scale;
          ng.drawImage(img, dc - R - (((S.view.lonC + 180) % 360) / 360) * dw, dc - R, dw, 2 * R);
          ng.restore();
          // terminator mask: white keeps night. Center slides with sun depth:
          // +1 (sun behind viewer) -> all day; -1 -> all night.
          const L = R * 1.35;
          const x0 = dc - sun.ax * L;
          const y0 = dc + sun.ay * L;
          const grad = ng.createLinearGradient(x0, y0, dc + sun.ax * L, dc - sun.ay * L);
          const center = Math.min(1, Math.max(0, 0.5 - sun.depth * 0.5));
          const wdt = 0.2;
          const t0 = Math.min(1, Math.max(0, center - wdt));
          const t1 = Math.min(1, Math.max(0, center + wdt));
          grad.addColorStop(0, 'rgba(255,255,255,0.97)');
          grad.addColorStop(t0, 'rgba(255,255,255,0.97)');
          grad.addColorStop(t1, 'rgba(255,255,255,0)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ng.globalCompositeOperation = 'destination-in';
          ng.fillStyle = grad;
          ng.fillRect(0, 0, size, size);
          g.drawImage(night, 0, 0);
        }
      }
      // atmosphere rim: two-layer radial glow
      const glow = g.createRadialGradient(dc, dc, R * 0.94, dc, dc, R * 1.13);
      glow.addColorStop(0, 'rgba(120,160,255,0)');
      glow.addColorStop(0.72, 'rgba(120,160,255,0.10)');
      glow.addColorStop(0.86, 'rgba(140,175,255,0.30)');
      glow.addColorStop(1, 'rgba(140,175,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, size, size);
      S.earth = layer;
    };

    const projectAll = (jd: number) => {
      const list = swarmRef.current;
      const tsinceNow = (m: { sat: { jdsatepoch: number } }) => (jd - m.sat.jdsatepoch) * 1440;
      // The camera rides with SPHEREx: same meridian, ~24° south of it, so the
      // craft always hangs over a huge Earth and the ground scrolls beneath.
      // (A fixed camera leaves a polar orbiter behind the limb half the orbit.)
      const heroEntry = list.find((e) => e.obj.hero) ?? list[0];
      let heroGeo: { lat: number; lon: number } | null = null;
      if (heroEntry) {
        const hp = propagate(heroEntry.sat, tsinceNow(heroEntry));
        if (hp.ok) heroGeo = eciToGeo(hp.r, jd);
      }
      const driftLat = S.reduced ? 0 : Math.sin(S.driftT / 47) * 1.6;
      const driftLon = S.reduced ? 0 : Math.sin(S.driftT / 83) * 2.2;
      const view: OrthoView = heroGeo
        ? {
            latC: Math.min(58, Math.max(-58, heroGeo.lat - 34 + driftLat)),
            lonC: heroGeo.lon + driftLon,
          }
        : { latC: S.view.latC + driftLat, lonC: S.view.lonC + driftLon };
      S.view = view;
      S.sats = list.map(({ obj, sat }) => {
        const p = propagate(sat, tsinceNow({ sat }));
        if (!p.ok) return { x: 0, y: 0, visible: false, name: obj.name, hero: !!obj.hero };
        const geo = eciToGeo(p.r, jd);
        const pr = orthoProject(geo.lat, geo.lon, geo.altKm, view);
        return {
          x: S.cx + pr.x * S.R,
          y: S.cy - pr.y * S.R,
          visible: pr.visible,
          name: obj.name,
          hero: !!obj.hero,
        };
      });
      const hp = heroEntry ? S.sats[list.indexOf(heroEntry)] : null;
      S.hero = hp && hp.visible ? { x: hp.x, y: hp.y, r: Math.max(40, Math.min(S.w, S.h) * 0.082) } : null;
      // ground-track trail: past positions, spectrum-tinted
      S.trail = [];
      if (heroEntry && !S.compact) {
        const base = tsinceNow(heroEntry);
        for (let m = TRAIL_MIN; m >= 0; m -= TRAIL_STEP) {
          const p = propagate(heroEntry.sat, base - m);
          if (!p.ok) continue;
          const geo = eciToGeo(p.r, jd - m / 1440);
          const pr = orthoProject(geo.lat, geo.lon, geo.altKm, view);
          if (pr.visible) S.trail.push({ x: S.cx + pr.x * S.R, y: S.cy - pr.y * S.R });
        }
      }
      S.picks = S.sats
        .map((s, si) => ({ kind: (s.hero ? 'hero' : 'sat') as Pick['kind'], x: s.x, y: s.y, name: s.name, si }))
        .filter((p) => S.sats[p.si].visible);
    };

    const drawSprite = (t: number) => {
      if (!S.hero) return;
      const { x, y, r } = S.hero;
      const bob = S.reduced ? 0 : Math.sin(t / 3.1) * 4;
      // soft halo so the one crafted machine reads against the dust
      if (!S.reduced) {
        const halo = 0.1 + 0.05 * Math.sin(t / 0.7);
        const hg = ctx.createRadialGradient(x, y + bob, 0, x, y + bob, r * 1.5);
        hg.addColorStop(0, `rgba(165,172,255,${halo.toFixed(3)})`);
        hg.addColorStop(1, 'rgba(165,172,255,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = hg;
        ctx.fillRect(x - r * 1.5, y + bob - r * 1.5, r * 3, r * 3);
        ctx.restore();
      }
      if (S.imgOk.sheet && S.imgs.sheet) {
        const img = S.imgs.sheet;
        const fw = img.naturalWidth / SHEET_COLS;
        const rows = Math.max(1, Math.round(S.frames / SHEET_COLS));
        const fh = img.naturalHeight / rows;
        const f = S.reduced ? 0 : Math.floor(t / 0.5) % S.frames;
        const sx = (f % SHEET_COLS) * fw;
        const sy = Math.floor(f / SHEET_COLS) * fh;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const d = r * 2.1;
        ctx.drawImage(img, sx, sy, fw, fh, x - d / 2, y - d / 2 + bob, d, d);
        ctx.restore();
      } else if (S.imgOk.poster && S.imgs.poster) {
        const img = S.imgs.poster;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const d = r * 2.1;
        ctx.drawImage(img, x - d / 2, y - d / 2 + bob, d, d);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = '#eef0f8';
        ctx.beginPath();
        ctx.arc(x, y + bob, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // pulsing hairline bracket (breathes, never blinks out)
      const pulse = S.reduced ? 0.6 : 0.5 + 0.28 * Math.sin(t / 0.35);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#eef0f8';
      ctx.lineWidth = 1.5;
      drawBracket(ctx, x, y + bob, r * 0.62, r * 0.22);
      ctx.restore();
      const label = 'SPHEREx';
      ctx.save();
      ctx.font = '11px "Geist Mono", monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(5,6,12,0.72)';
      ctx.fillRect(x - tw / 2 - 6, y + bob + r * 0.62 + 8, tw + 12, 20);
      ctx.strokeStyle = 'rgba(238,240,248,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeText(label, x - tw / 2, y + bob + r * 0.62 + 22);
      ctx.fillStyle = '#eef0f8';
      ctx.fillText(label, x - tw / 2, y + bob + r * 0.62 + 22);
      ctx.restore();
    };

    const frame = (t: number) => {
      if (!S.alive) return;
      S.raf = 0;
      S.driftT = t;
      const jd = simJD();
      buildEarth(jd);
      projectAll(jd);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, S.w, S.h);
      if (S.stars) ctx.drawImage(S.stars, 0, 0, S.w, S.h);
      if (!S.reduced) {
        // starlight shimmer: bright stars breathe at their own rates
        for (const s of S.twinkle) {
          const a = 0.25 + s.b * 0.55 * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
          ctx.globalAlpha = Math.max(0.08, a);
          ctx.fillStyle = STAR_FILL[s.ci % STAR_FILL.length];
          const d = Math.max(1.2, s.r * 1.6);
          ctx.fillRect(s.x - d / 2, s.y - d / 2, d, d);
        }
        ctx.globalAlpha = 1;
      }
      if (S.earth) {
        if (S.earthFade < 1) S.earthFade = Math.min(1, S.earthFade + 1 / 54);
        const pad = S.R * 0.14;
        ctx.save();
        ctx.globalAlpha = S.earthFade;
        ctx.drawImage(S.earth, S.cx - S.R - pad, S.cy - S.R - pad, 2 * (S.R + pad), 2 * (S.R + pad));
        ctx.restore();
      }
      // ground-track trail, spectrum gradient along path
      if (S.trail.length > 1) {
        const a = S.trail[0];
        const b = S.trail[S.trail.length - 1];
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        ['#7c83fd', '#5aa9e6', '#4fc9a8', '#e8c34a', '#f08a4b', '#e85d4a'].forEach((c, i, arr) =>
          grad.addColorStop(i / (arr.length - 1), c),
        );
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        S.trail.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }
      // swarm: dim dust-points, physically correct at this distance
      ctx.save();
      for (const s of S.sats) {
        if (!s.visible || s.hero) continue;
        const hot = S.hover?.kind === 'sat' && S.hover.name === s.name;
        ctx.globalAlpha = hot ? 0.95 : 0.5;
        ctx.fillStyle = hot ? '#eef0f8' : '#aab0c8';
        const d = hot ? 3 : 2;
        ctx.fillRect(s.x - d / 2, s.y - d / 2, d, d);
      }
      ctx.restore();
      drawSprite(t);
      // nudge arc toward SPHEREx after a wrong pick (fades over ~2.5 s)
      if (S.nudge && S.hero) {
        const age = t - S.nudge.t0;
        if (age > 2.6) {
          S.nudge = null;
        } else {
          const { x0, y0, x1, y1 } = S.nudge;
          const mx = (x0 + x1) / 2;
          const my = Math.min(y0, y1) - 46;
          ctx.save();
          ctx.globalAlpha = 0.8 * (1 - age / 2.6);
          ctx.strokeStyle = '#4fc9a8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(mx, my, x1, y1);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (!S.reduced && !document.hidden) {
        S.raf = requestAnimationFrame((nt) => frame(nt / 1000));
      }
    };

    const refreshHud = () => {
      if (!S.alive) return;
      const list = swarmRef.current;
      const hero = list.find((e) => e.obj.hero) ?? list[0];
      if (!hero) return;
      // sim date drives position + clock; real date keeps the TLE age honest
      const simDate = new Date(S.ms0 + (Date.now() - S.ms0) * S.warp);
      const t = telemetryFor(hero, simDate, new Date());
      setHud(t);
      setWarp(S.warp);
      setCount(list.length);
      const doy = epochDate(hero.sat).getTime();
      const start = Date.UTC(epochDate(hero.sat).getUTCFullYear(), 0, 0);
      const epochDoy = ((doy - start) / 86400000).toFixed(2);
      setNorad({ norad: hero.obj.norad, cospar: hero.obj.cospar ?? '', epochDoy });
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best: Pick | null = null;
      let bestD = 14;
      for (const p of S.picks) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      // generous hero target: bracket radius
      if (S.hero && Math.hypot(S.hero.x - x, S.hero.y - y) < S.hero.r) {
        best = { kind: 'hero', x: S.hero.x, y: S.hero.y, name: 'SPHEREx', si: -1 };
      }
      S.hover = best;
      setHoverName(best ? best.name : null);
      const tag = tagRef.current;
      if (tag) {
        if (best && best.kind === 'sat') {
          tag.style.display = 'block';
          tag.style.left = `${best.x + 12}px`;
          tag.style.top = `${best.y - 10}px`;
          tag.textContent = best.name;
        } else {
          tag.style.display = 'none';
        }
      }
      canvas.style.cursor = S.hero && Math.hypot(S.hero.x - x, S.hero.y - y) < S.hero.r * 1.7 ? 'crosshair' : 'default';
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (S.hero && Math.hypot(S.hero.x - x, S.hero.y - y) < Math.max(44, S.hero.r)) {
        const f = { x: S.hero.x, y: S.hero.y };
        cb.current.onEnter(f);
        return;
      }
      let best: Pick | null = null;
      let bestD = 16;
      for (const p of S.picks) {
        if (p.kind !== 'sat') continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best && S.hero) {
        S.nudge = { x0: best.x, y0: best.y, x1: S.hero.x, y1: S.hero.y, t0: S.driftT };
        setWhisper('Not this one. That one sees in 102 colors.');
        window.setTimeout(() => {
          if (S.alive) setWhisper(null);
        }, 2600);
        kick(true);
      }
    };

    const onVis = () => {
      if (document.hidden) return;
      kick(true);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', onVis);
    refreshHud();
    S.hudTimer = setInterval(refreshHud, 1000);

    // textures land async; each arrival rebuilds the cached layers
    void Promise.all([loadImg(earthDay), loadImg(earthNight), loadImg(earthClouds), loadImg(craftSprite), loadImg(craftPoster)]).then(
      ([day, night, clouds, sheet, poster]) => {
        if (!S.alive) return;
        const hadTex = S.imgOk.day;
        S.imgs = { day, night, clouds, sheet, poster };
        S.imgOk = { day: !!day, night: !!night, clouds: !!clouds, sheet: !!sheet, poster: !!poster };
        if (sheet) {
          const rows = Math.max(1, Math.round(sheet.naturalHeight / (sheet.naturalWidth / SHEET_COLS)));
          S.frames = Math.min(SHEET_FRAMES, SHEET_COLS * rows);
        }
        if (S.imgOk.day && !hadTex) S.earthFade = 0; // fade the real Earth in
        S.earthKey = '';
        kick(true);
      },
    );
    kick(true);

    return () => {
      S.alive = false;
      if (S.raf) cancelAnimationFrame(S.raf);
      if (S.hudTimer) clearInterval(S.hudTimer);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVis);
      reducedMq.removeEventListener('change', onReduced);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mjd = hud ? hud.mjd.toFixed(5) : '—';
  return (
    <div ref={wrapRef} className="orbital" role="region" aria-label="Live orbital view: SPHEREx and tracked satellites">
      <canvas
        ref={canvasRef}
        className="orbital-sky"
        role="img"
        aria-label={
          hud
            ? `Live orbit: SPHEREx over ${hud.lat.toFixed(1)} degrees ${hud.lat >= 0 ? 'north' : 'south'}, ${Math.abs(hud.lon).toFixed(1)} degrees ${hud.lon >= 0 ? 'east' : 'west'}. ${count} objects tracked. Activate the invitation to enter.`
            : 'Live orbit view loading.'
        }
      />
      <div className="orbital-hud mono" aria-live="off">
        <div>
          SPHEREx · NORAD {norad?.norad ?? 63182} · {norad?.cospar ?? '2025-047E'}
          <span className="orbital-hud-r">MJD {mjd}</span>
        </div>
        <div>
          ALT {hud ? `${hud.altKm.toFixed(1)} KM · V ${hud.velKmS.toFixed(2)} KM/S · INC ${hud.incDeg.toFixed(1)}°` : '—'}
          <span className="orbital-hud-dim"> (live TLE, epoch {norad?.epochDoy ?? '—'})</span>
        </div>
        <div>SUB-POINT&nbsp;&nbsp;{hud ? `${fmtLat(hud.lat)}  ${fmtLon(hud.lon)}` : '—'}</div>
        <div>
          BORESIGHT&nbsp;&nbsp;
          {hud?.boresight ? `RA ${hud.boresight.ra.toFixed(2)}°  DEC ${hud.boresight.dec >= 0 ? '+' : '−'}${Math.abs(hud.boresight.dec).toFixed(2)}°` : '—'}
          <span className="orbital-hud-dim"> (approx)</span>
        </div>
        <div>
          TRACKED OBJECTS {count} · SCANNING · QR2 · TIME ×{warp}
          {hud && hud.tleAgeDays > 14 ? <span className="orbital-hud-dim"> · TLE {hud.tleAgeDays.toFixed(0)}d old</span> : ''}
        </div>
      </div>
      <div ref={tagRef} className="orbital-tag mono" style={{ display: 'none' }} aria-hidden="true" />
      {whisper && (
        <div className="orbital-whisper" role="status">
          {whisper}
        </div>
      )}
      <button type="button" className="orbital-invite" onClick={() => onEnter()}>
        Click SPHEREx to see what it&rsquo;s doing.
      </button>
      <button type="button" className="btn orbital-skip" onClick={onSkip} aria-label="Skip intro">
        Skip intro
      </button>
      <span className="sr-only" aria-live="polite">
        {hoverName ? `Tracking ${hoverName}.` : ''}
      </span>
    </div>
  );
}
