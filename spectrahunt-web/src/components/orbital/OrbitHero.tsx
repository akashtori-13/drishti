'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  eciToGeo, getSwarmBundle, nowJD, periodMin, prepareSwarm,
  propagate, type PreparedSat,
} from '@/lib/orbit';
import { loadCachedImage } from '@/lib/skycache';
import FALLBACK from '@/lib/tle-bundle.fallback.json';
import type { SwarmBundle } from '@/lib/orbit';

const fallback = FALLBACK as SwarmBundle;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Read-once texture pixels for the spherical sampler (cached per image). */
function sampleTexture(img: HTMLImageElement): { w: number; h: number; d: Uint8ClampedArray } | null {
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 2;
    c.height = img.naturalHeight || 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return null;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, d };
  } catch {
    return null;
  }
}
const WARP = 60; // honest sim clock, same as the intro

interface SatPt { x: number; y: number; behind: boolean }

/**
 * Hero orbital panel: live SPHEREx + tracked neighbours wheeling over a
 * rotating Earth, computed from real TLEs (same data layer as /intro, none
 * of its cinematic chrome). Drag to rotate, scroll to zoom, hover sats,
 * click SPHEREx for the full intro. Falls back to the static poster.
 */
export default function OrbitHero() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [mode, setMode] = useState<'loading' | 'live' | 'poster'>('loading');
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setMode('poster');
      return;
    }
    let alive = true;
    const S = {
      w: 0, h: 0, dpr: 1, cx: 0, cy: 0, R: 100,
      lonC: 90.41, latC: 23.81, zoom: 1,
      homeLon: 90.41, homeLat: 23.81, backAt: 0,
      day: null as HTMLImageElement | null,
      clouds: null as HTMLImageElement | null,
      sheet: null as HTMLImageElement | null,
      stars: [] as Array<{ x: number; y: number; r: number; ph: number }>,
      sats: [] as PreparedSat[],
      hero: null as PreparedSat | null,
      trail: [] as Array<{ x: number; y: number; behind: boolean }>,
      ms0: Date.now(), jd0: nowJD(),
      sphere: null as HTMLCanvasElement | null,
      keyed: null as HTMLCanvasElement | null,
      dayData: null as { w: number; h: number; d: Uint8ClampedArray } | null,
      cloudData: null as { w: number; h: number; d: Uint8ClampedArray } | null,
      raf: 0, inView: true,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      hover: null as PreparedSat | null,
      drag: null as { x: number; y: number; lon: number; lat: number } | null,
      sphereImg: null as ImageData | null,
      ringPts: null as Array<{ x: number; y: number } | null> | null,
      ringAt: 0,
      ringLon: 0,
      ringLat: 0,
      lastT: 0,
    };
    const simJD = () => S.jd0 + ((Date.now() - S.ms0) / 86400000) * WARP;

    // P0: S.R is the single source of disc scale; zoom only changes S.zoom,
    // applyZoom() recomputes S.R so wheel/pinch/keyboard zoom never no-ops.
    const applyZoom = () => {
      S.R = Math.min(S.w, S.h) * 0.33 * S.zoom;
    };

    const layout = () => {
      const r = wrap.getBoundingClientRect();
      S.w = Math.max(1, Math.round(r.width));
      S.h = Math.max(1, Math.round(r.height));
      S.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(S.w * S.dpr);
      canvas.height = Math.round(S.h * S.dpr);
      S.cx = S.w * 0.5;
      S.cy = S.h * 0.52;
      // earth + halo must fit vertically: cy + 1.45R <= h (halo was clipping)
      applyZoom();
    };

    const project = (lat: number, lon: number): SatPt => {
      const la = lat * D2R;
      const lo = (lon - S.lonC) * D2R;
      const lc = S.latC * D2R;
      const cosc = Math.sin(lc) * Math.sin(la) + Math.cos(lc) * Math.cos(la) * Math.cos(lo);
      return {
        x: S.cx + S.R * Math.cos(la) * Math.sin(lo),
        y: S.cy - S.R * (Math.cos(lc) * Math.sin(la) - Math.sin(lc) * Math.cos(la) * Math.cos(lo)),
        behind: cosc < 0.02,
      };
    };

    const satLatLon = (s: PreparedSat, jd: number): { lat: number; lon: number } | null => {
      const p = propagate(s.sat, (jd - s.sat.jdsatepoch) * 1440);
      if (!p.ok) return null;
      const g = eciToGeo(p.r, jd);
      return { lat: g.lat, lon: g.lon };
    };

    const draw = (nowMs = performance.now()) => {
      const { w, h } = S;
      if (!w || !h) return;
      // keep disc scale in sync even if zoom changed without a layout
      const wantR = Math.min(S.w, S.h) * 0.33 * S.zoom;
      if (Math.abs(wantR - S.R) > 0.01) S.R = wantR;
      // dt-based ease home after idle drags: frame-rate independent lerp.
      // Bangladesh stays centered, always.
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - (S.lastT || nowMs - 16)) / 1000));
      S.lastT = nowMs;
      if (!dragRef.current && S.backAt > 0 && Date.now() > S.backAt) {
        const k = 1 - Math.exp(-dt * 2.4);
        const dl = (((S.homeLon - S.lonC + 540) % 360) - 180) * k;
        const db = (S.homeLat - S.latC) * k;
        S.lonC = normLon(S.lonC + dl);
        S.latC = Math.max(-60, Math.min(60, S.latC + db));
        if (Math.abs(dl) < 0.02 && Math.abs(db) < 0.02) {
          S.lonC = S.homeLon;
          S.latC = S.homeLat;
          S.backAt = 0;
        }
      }
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const TAU = Math.PI * 2;
      const jd = simJD();
      // starfield
      ctx.fillStyle = 'rgba(220,228,245,.55)';
      for (const s of S.stars) {
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(s.ph + Date.now() / 1400));
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // earth disc: TRUE spherical mapping. Each disc pixel is inverse-
      // projected to lat/lon (orthographic) and sampled from the textures,
      // so limbs compress and poles converge like a real globe — never a flat
      // map pasted in a circle. Day/night comes from the actual sun vector.
      const R = S.R;
      const ER = 140; // offscreen sampler resolution (cheap, scaled up)
      if (!S.sphere || S.sphere.width !== ER * 2) {
        S.sphere = document.createElement('canvas');
        S.sphere.width = ER * 2;
        S.sphere.height = ER * 2;
      }
      if (S.day && !S.dayData) {
        S.dayData = sampleTexture(S.day);
        S.cloudData = S.clouds ? sampleTexture(S.clouds) : null;
      }
      if (S.day && S.dayData) {
        // frozen rotation: rot=180 parks Bangladesh (u≈0.751) at disc center
        // so home is always centered; the spacecraft still fly in real time
        const rot = 180;
        const sctx = S.sphere.getContext('2d');
        if (sctx) {
          // per-frame budget: reuse one ImageData buffer, never allocate
          if (!S.sphereImg || S.sphereImg.width !== ER * 2 || S.sphereImg.height !== ER * 2) {
            S.sphereImg = sctx.createImageData(ER * 2, ER * 2);
          }
          const img = S.sphereImg;
          const px = img.data;
          // fixed golden-hour sun over South Asia: BD always starts in
          // daylight. Lighting only — satellites still fly real time.
          // (The live clock belongs to the spacecraft, not the sun.)
          const sla = 12 * D2R;
          const slo = (105 - S.lonC) * D2R;
          const slc = S.latC * D2R;
          let svx = Math.cos(sla) * Math.sin(slo);
          let svy = Math.cos(slc) * Math.sin(sla) - Math.sin(slc) * Math.cos(sla) * Math.cos(slo);
          let svz = Math.sin(slc) * Math.sin(sla) + Math.cos(slc) * Math.cos(sla) * Math.cos(slo);
          const sl = Math.max(1e-9, Math.hypot(svx, svy, svz));
          svx /= sl; svy /= sl; svz /= sl;
          const lc = S.latC * D2R;
          const sinLc = Math.sin(lc);
          const cosLc = Math.cos(lc);
          const dw = S.dayData.w;
          const dh = S.dayData.h;
          const dd = S.dayData.d;
          const cw = S.cloudData ? S.cloudData.w : 0;
          const ch = S.cloudData ? S.cloudData.h : 0;
          const cd = S.cloudData ? S.cloudData.d : null;
          for (let py = 0; py < ER * 2; py++) {
            // screen y runs DOWN, math latitude runs UP: negate once here so
            // the map isn't flipped (north pole previously rendered south)
            const ny = -((py - ER + 0.5) / ER);
            for (let pxI = 0; pxI < ER * 2; pxI++) {
              const nx = (pxI - ER + 0.5) / ER;
              const rr = nx * nx + ny * ny;
              const o = (py * ER * 2 + pxI) * 4;
              if (rr > 1) {
                px[o + 3] = 0;
                continue;
              }
              const nz = Math.sqrt(Math.max(0, 1 - rr));
              // inverse orthographic -> lat/lon
              const c = Math.asin(Math.min(1, Math.sqrt(rr)));
              const sinc = Math.sin(c);
              const cosc = Math.cos(c);
              let lat: number;
              let lon: number;
              if (rr < 1e-9) {
                lat = S.latC;
                lon = S.lonC;
              } else {
                lat = Math.asin(Math.min(1, Math.max(-1, cosc * sinLc + (ny * sinc * cosLc) / Math.sqrt(rr)))) * R2D;
                lon = S.lonC + Math.atan2(nx * sinc, Math.sqrt(rr) * cosLc * cosc - ny * sinLc * sinc) * R2D;
              }
              // texture sample (bilinear-ish: nearest is fine at this scale)
              const u = (((lon + rot) % 360) + 360) % 360 / 360;
              const v = Math.min(0.999, Math.max(0, (90 - lat) / 180));
              const tx = Math.min(dw - 1, Math.floor(u * dw));
              const ty = Math.min(dh - 1, Math.floor(v * dh));
              const ti = (ty * dw + tx) * 4;
              let r = dd[ti];
              let g = dd[ti + 1];
              let b = dd[ti + 2];
              if (cd) {
                const cx2 = Math.min(cw - 1, Math.floor(u * cw));
                const cy2 = Math.min(ch - 1, Math.floor(v * ch));
                const ci = (cy2 * cw + cx2) * 4;
                const ca = (cd[ci] / 255) * 0.4;
                r = r + (255 - r) * ca * 0.5;
                g = g + (255 - g) * ca * 0.5;
                b = b + (255 - b) * ca * 0.5;
              }
              // real terminator: diffuse from the sun vector
              const diff = Math.max(0, nx * svx + ny * svy + nz * svz);
              const li = 0.045 + 0.955 * Math.pow(diff, 0.75);
              px[o] = Math.round(r * li);
              px[o + 1] = Math.round(g * li);
              px[o + 2] = Math.round(b * li);
              px[o + 3] = 255;
            }
          }
          sctx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(S.sphere, S.cx - R, S.cy - R, R * 2, R * 2);
        }
      }
      // ground the sphere: dark limb ring inside the edge + gentle polar calm
      // (equirectangular ice stretches wide and reads as clipping otherwise)
      ctx.save();
      ctx.beginPath();
      ctx.arc(S.cx, S.cy, R, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = 'rgba(2,3,8,.55)';
      ctx.lineWidth = Math.max(6, R * 0.07);
      ctx.beginPath();
      ctx.arc(S.cx, S.cy, R - Math.max(3, R * 0.035), 0, TAU);
      ctx.stroke();
      const polar = ctx.createLinearGradient(0, S.cy - R, 0, S.cy + R);
      polar.addColorStop(0, 'rgba(4,5,10,.5)');
      polar.addColorStop(0.22, 'rgba(4,5,10,0)');
      polar.addColorStop(0.78, 'rgba(4,5,10,0)');
      polar.addColorStop(1, 'rgba(4,5,10,.5)');
      ctx.fillStyle = polar;
      ctx.fillRect(S.cx - R, S.cy - R, R * 2, R * 2);
      ctx.restore();
      // limb glow + outer atmosphere halo (the bg is pure black: the planet
      // must carry its own separation — halo first, then the tighter limb)
      const halo = ctx.createRadialGradient(S.cx, S.cy, R * 0.9, S.cx, S.cy, R * 1.45);
      halo.addColorStop(0, 'rgba(90,140,255,0)');
      halo.addColorStop(0.72, 'rgba(90,140,255,.07)');
      halo.addColorStop(0.86, 'rgba(130,160,255,.16)');
      halo.addColorStop(1, 'rgba(130,160,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(S.cx, S.cy, R * 1.45, 0, TAU);
      ctx.fill();
      const limb = ctx.createRadialGradient(S.cx, S.cy, R * 0.9, S.cx, S.cy, R * 1.1);
      limb.addColorStop(0, 'rgba(124,131,253,0)');
      limb.addColorStop(0.8, 'rgba(140,170,255,.22)');
      limb.addColorStop(1, 'rgba(140,170,255,0)');
      ctx.fillStyle = limb;
      ctx.beginPath();
      ctx.arc(S.cx, S.cy, R * 1.1, 0, TAU);
      ctx.fill();

      // orbit ring: hero path sampled over one period, brightest near the
      // spacecraft and fading along the path so depth reads at a glance.
      // Per-frame budget: the 72-segment SGP4 sweep is cached ~1Hz (and on
      // camera moves); frames in between redraw the cached polyline.
      if (S.hero) {
        try {
          const moved = Math.abs(S.lonC - S.ringLon) > 0.05 || Math.abs(S.latC - S.ringLat) > 0.05;
          if (!S.ringPts || nowMs - S.ringAt > 1000 || moved) {
            const per = periodMin(S.hero.sat);
            const pts: Array<{ x: number; y: number } | null> = [];
            for (let k = 0; k <= 72; k++) {
              const jj = jd + (per / 1440) * (k / 72);
              const p = propagate(S.hero.sat, (jj - S.hero.sat.jdsatepoch) * 1440);
              if (!p.ok) { pts.push(null); continue; }
              const g = eciToGeo(p.r, jj);
              const pt = project(g.lat, g.lon);
              pts.push(pt.behind ? null : { x: pt.x, y: pt.y });
            }
            S.ringPts = pts;
            S.ringAt = nowMs;
            S.ringLon = S.lonC;
            S.ringLat = S.latC;
          }
          ctx.lineWidth = 1.2;
          let prev: { x: number; y: number } | null = null;
          const pts = S.ringPts ?? [];
          for (let k = 0; k < pts.length; k++) {
            const pt = pts[k];
            if (!pt) { prev = null; continue; }
            if (prev) {
              const a = 0.08 + 0.42 * (1 - k / 72);
              ctx.strokeStyle = `rgba(124,131,253,${a.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
            }
            prev = pt;
          }
        } catch { /* ring is decoration */ }
      }
      // swarm neighbours (dim, front side only) + hero (ALWAYS visible:
      // solid + glowing on the front side, hollow + dashed behind the limb
      // so the eye never loses the spacecraft)
      const drawSat = (s: PreparedSat, hero: boolean) => {
        const ll = satLatLon(s, jd);
        if (!ll) return null;
        const pt = project(ll.lat, ll.lon);
        if (!hero && pt.behind) return null;
        if (hero) {
          if (pt.behind) {
            ctx.strokeStyle = 'rgba(200,212,255,.75)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 9, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(200,212,255,.5)';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2, 0, TAU);
            ctx.fill();
          } else {
            // outward radial: the telescope opening faces deep space
            const ox = pt.x - S.cx;
            const oy = pt.y - S.cy;
            const ol = Math.max(1, Math.hypot(ox, oy));
            const ux = ox / ol;
            const uy = oy / ol;
            const sz = Math.max(22, Math.min(56, S.R * 0.22));
            // faint sight-line into deep space
            const cone = ctx.createLinearGradient(pt.x, pt.y, pt.x + ux * sz * 2.4, pt.y + uy * sz * 2.4);
            cone.addColorStop(0, 'rgba(150,180,255,.14)');
            cone.addColorStop(1, 'rgba(150,180,255,0)');
            ctx.strokeStyle = cone;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pt.x + ux * sz * 0.4, pt.y + uy * sz * 0.4);
            ctx.lineTo(pt.x + ux * sz * 2.4, pt.y + uy * sz * 2.4);
            ctx.stroke();
            if (S.sheet && S.sheet.naturalWidth) {
              // real SPHEREx model: turntable frame, opening rotated outward.
              // Craft fills most of its cell: measured bounds crop. Cell black
              // padding is keyed out per frame (near-black -> transparent) so
              // only the spacecraft draws — no black box.
              const fw = S.sheet.naturalWidth / 8;
              const fh = S.sheet.naturalHeight / 6;
              const fr = S.reduced ? 0 : Math.floor(Date.now() / 500) % 48;
              const ang = Math.atan2(ux, -uy);
              const cs = 432;
              const csx = (fr % 8) * fw + 40;
              const csy = (Math.floor(fr / 8) % 6) * fh + 80;
              const ks = 72;
              if (!S.keyed || S.keyed.width !== ks) {
                S.keyed = document.createElement('canvas');
                S.keyed.width = ks;
                S.keyed.height = ks;
              }
              const kx = S.keyed.getContext('2d', { willReadFrequently: true });
              if (kx) {
                kx.clearRect(0, 0, ks, ks);
                kx.drawImage(S.sheet, csx, csy, cs, cs, 0, 0, ks, ks);
                try {
                  const kd = kx.getImageData(0, 0, ks, ks);
                  const kp = kd.data;
                  for (let i = 0; i < kp.length; i += 4) {
                    const lum = kp[i] * 0.299 + kp[i + 1] * 0.587 + kp[i + 2] * 0.114;
                    if (lum < 18) kp[i + 3] = 0;
                  }
                  kx.putImageData(kd, 0, 0);
                } catch { /* keep unkeyed frame */ }
              }
              ctx.save();
              ctx.translate(pt.x, pt.y);
              ctx.rotate(ang);
              ctx.drawImage(S.keyed ?? S.sheet, -sz / 2, -sz / 2, sz, sz);
              ctx.restore();
            } else {
              const gl = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 16);
              gl.addColorStop(0, 'rgba(255,255,255,.95)');
              gl.addColorStop(0.35, 'rgba(124,131,253,.7)');
              gl.addColorStop(1, 'rgba(124,131,253,0)');
              ctx.fillStyle = gl;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 16, 0, TAU);
              ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 3.2, 0, TAU);
              ctx.fill();
            }
            // shutter: SPHEREx is always taking pictures — blink + ring ~5s
            if (!S.reduced) {
              const cyc = (Date.now() / 1000) % 5;
              if (cyc < 0.22) {
                const k = 1 - cyc / 0.22;
                ctx.fillStyle = `rgba(255,255,255,${(0.55 * k).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, sz * 0.32, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = `rgba(180,200,255,${(0.6 * k).toFixed(3)})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, sz * 0.32 + cyc * 130, 0, TAU);
                ctx.stroke();
              }
            }
          }
          S.trail.push({ x: pt.x, y: pt.y, behind: pt.behind });
          if (S.trail.length > 46) S.trail.shift();
        } else {
          ctx.fillStyle = 'rgba(170,180,210,.5)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.6, 0, TAU);
          ctx.fill();
        }
        return pt;
      };
      for (const s of S.sats) {
        if (s === S.hero) continue;
        drawSat(s, false);
      }
      // hero is always visible: solid + glowing on the front side, hollow +
      // dashed behind the limb — and the trail breaks there instead of
      // smearing across land it has left.
      if (S.hero) drawSat(S.hero, true);
      if (S.trail.length > 1) {
        ctx.strokeStyle = 'rgba(124,131,253,.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let pen = false;
        for (const p of S.trail) {
          if (p.behind) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      // hover ring
      if (S.hover) {
        const ll = satLatLon(S.hover, jd);
        if (ll) {
          const pt = project(ll.lat, ll.lon);
          if (!pt.behind) {
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 10, 0, TAU);
            ctx.stroke();
          }
        }
      }
    };

    let raf = 0;
    const loop = (t: number) => {
      raf = 0;
      draw(t);
      if (S.inView && !S.reduced && document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    const poke = () => {
      if (S.inView && !S.reduced && document.visibilityState === 'visible') {
        if (!raf) raf = requestAnimationFrame(loop);
      } else if (!raf) {
        raf = requestAnimationFrame((t) => { raf = 0; draw(t); });
      }
    };

    // assets: earth textures + real TLE bundle (cached, with fallback)
    layout();
    void Promise.all([
      loadCachedImage('/orbital/earth_day.webp').catch(() => null),
      loadCachedImage('/orbital/earth_clouds.webp').catch(() => null),
      loadCachedImage('/orbital/spherex_turntable.webp').catch(() => null),
    ]).then(([day, clouds, sheet]) => {
      if (!alive) return;
      if (!day) {
        setMode('poster');
        return;
      }
      S.day = day;
      S.clouds = clouds;
      S.sheet = sheet;
      let s = 424242;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
      S.stars = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.4, ph: rnd() * Math.PI * 2 }));
      void getSwarmBundle(fallback).then((b) => {
        if (!alive) return;
        const sats = prepareSwarm(b).slice(0, 60);
        S.sats = sats;
        S.hero = sats.find((e) => e.obj.hero) ?? sats[0] ?? null;
        setMode('live');
        poke();
      }).catch(() => {
        if (!alive) return;
        setMode('live');
        poke();
      });
      poke();
    });

    const pick = (mx: number, my: number): PreparedSat | null => {
      const jd = simJD();
      let best: PreparedSat | null = null;
      let bestD = 16;
      const consider = (s: PreparedSat | null) => {
        if (!s) return;
        const ll = satLatLon(s, jd);
        if (!ll) return;
        const pt = project(ll.lat, ll.lon);
        if (pt.behind) return;
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < bestD) { bestD = d; best = s; }
      };
      consider(S.hero);
      for (const s of S.sats) {
        if (s === S.hero) continue;
        consider(s);
      }
      return best;
    };

    const toLocal = (e: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        // content follows the cursor: dragging right pulls the map right, so
        // the view center moves west (lon decreases); latitude follows suit
        S.lonC = normLon(dragRef.current.lon - dx * 0.12);
        S.latC = Math.max(-60, Math.min(60, dragRef.current.lat + dy * 0.12));
        poke();
        return;
      }
      if (e.pointerType === 'touch') return;
      const p = toLocal(e);
      const h = pick(p.x, p.y);
      S.hover = h;
      // ref-only tooltip: position + text mutate the DOM node, no React
      // state churn on every pointermove.
      const tip = tipRef.current;
      if (tip) {
        if (h) {
          tip.textContent = h.obj.name;
          tip.style.opacity = '1';
          tip.style.left = `${Math.min(S.w - 8, p.x + 16)}px`;
          tip.style.top = `${Math.max(8, p.y - 14)}px`;
        } else {
          tip.style.opacity = '0';
        }
      }
      canvas.style.cursor = h ? (h === S.hero ? 'pointer' : 'default') : 'grab';
    };
    const onDown = (e: PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { x: e.clientX, y: e.clientY, lon: S.lonC, lat: S.latC };
    };
    const onUp = (e: PointerEvent) => {
      const wasDrag = dragRef.current &&
        Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y) > 5;
      dragRef.current = null;
      if (wasDrag) {
        S.backAt = Date.now() + 6000; // drift home 6s after a drag
        return;
      }
      const p = toLocal(e);
      const h = pick(p.x, p.y);
      if (h && h === S.hero) router.push('/intro');
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      S.zoom = Math.min(2.2, Math.max(0.6, S.zoom * (e.deltaY > 0 ? 0.92 : 1.09)));
      applyZoom();
      S.ringAt = 0; // disc scale changed: ring cache must rebuild
      poke();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 4;
      let used = true;
      if (e.key === 'ArrowLeft') S.lonC = normLon(S.lonC - step);
      else if (e.key === 'ArrowRight') S.lonC = normLon(S.lonC + step);
      else if (e.key === 'ArrowUp') S.latC = Math.max(-60, Math.min(60, S.latC + step));
      else if (e.key === 'ArrowDown') S.latC = Math.max(-60, Math.min(60, S.latC - step));
      else if (e.key === '+' || e.key === '=' || e.key === 'Add') {
        S.zoom = Math.min(2.2, S.zoom * 1.12);
        applyZoom();
        S.ringAt = 0;
      } else if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
        S.zoom = Math.max(0.6, S.zoom / 1.12);
        applyZoom();
        S.ringAt = 0;
      } else if (e.key === 'Enter' || e.key === ' ') {
        routerRef.current.push('/intro');
      } else used = false;
      if (used) {
        e.preventDefault();
        S.backAt = 0; // keyboard takes over: cancel the ease-home drift
        poke();
      }
    };
    const io = new IntersectionObserver((es) => {
      S.inView = es.some((e) => e.isIntersecting);
      poke();
    });
    io.observe(wrap);
    const onVis = () => poke();
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => { layout(); poke(); });
    ro.observe(wrap);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    layout();
    poke();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === 'poster') {
    return (
      <div ref={wrapRef} className="orbit-hero" role="img" aria-label="SPHEREx artwork">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/orbital/poster.webp" alt="SPHEREx spacecraft artwork" draggable={false} />
      </div>
    );
  }
  return (
    <div ref={wrapRef} className="orbit-hero">
      <canvas
        ref={canvasRef} role="img" tabIndex={0}
        aria-label="Live orbital view: SPHEREx and tracked satellites over Earth. Drag to rotate, scroll to zoom. Focus and use arrow keys to rotate, plus and minus to zoom, Enter to open the intro."
      />
      <div
        ref={tipRef}
        className="orbit-tip mono"
        aria-hidden="true"
        style={{ opacity: 0 }}
      />
    </div>
  );
}

function normLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
