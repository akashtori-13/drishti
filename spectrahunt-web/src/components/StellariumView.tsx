'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/showcases';
import { cachedImageSrc, loadCachedImage, lsGet, lsSet, prefetch } from '@/lib/skycache';

export interface Observer { lat: number; lon: number; name: string }
export interface StelFocus { ra: number; dec: number; key: number }

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TAU = Math.PI * 2;

const SURVEYS = [
  { id: 'CDS/P/DSS2/color', label: 'DSS color' },
  { id: 'CDS/P/2MASS/color', label: '2MASS IR' },
];

/** Lines: fetched once from d3-celestial mirror (GeoJSON, degrees). */
interface ConLines { features: Array<{ id: string; geometry: { coordinates: number[][][] } }> }
let linesCache: ConLines | null = null;
async function loadLines(): Promise<ConLines | null> {
  if (linesCache) return linesCache;
  // 1) vendored copy (self-reliant, always available offline)
  try {
    const r = await fetch('/data/constellations.lines.json');
    if (r.ok) {
      linesCache = (await r.json()) as ConLines;
      return linesCache;
    }
  } catch { /* fall through to remote */ }
  // 2) upstream mirror (picks up corrections)
  try {
    const r = await fetch('https://ofrohn.github.io/data/constellations.lines.json');
    if (!r.ok) return linesCache;
    linesCache = (await r.json()) as ConLines;
    return linesCache;
  } catch {
    return linesCache;
  }
}

function lstDeg(date: Date, lon: number): number {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  return (((gmst + lon) % 360) + 360) % 360;
}

export function altAz(ra: number, dec: number, lat: number, lon: number, date: Date): { alt: number; az: number } {
  const H = (lstDeg(date, lon) - ra) * D2R;
  const d = dec * D2R;
  const la = lat * D2R;
  const alt = Math.asin(Math.sin(d) * Math.sin(la) + Math.cos(d) * Math.cos(la) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(la) - Math.tan(d) * Math.cos(la));
  return { alt: alt * R2D, az: (((az * R2D + 180) % 360) + 360) % 360 };
}

/** Gnomonic forward: point -> tangent-plane coords (radians-ish). null when behind. */
function project(ra: number, dec: number, ra0: number, dec0: number): { x: number; y: number } | null {
  const dRa = (ra - ra0) * D2R;
  const d = dec * D2R;
  const d0 = dec0 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dRa);
  if (cosc < 0.12) return null;
  return {
    x: (Math.cos(d) * Math.sin(dRa)) / cosc,
    y: (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dRa)) / cosc,
  };
}

/** Gnomonic inverse: screen offset (in units of scale) -> sky. yUp positive. */
function unproject(x: number, y: number, ra0: number, dec0: number): { ra: number; dec: number } {
  const rho = Math.hypot(x, y);
  const c = Math.atan(rho);
  const d0 = dec0 * D2R;
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (rho > 1e-9 ? ((y * Math.sin(c) * Math.cos(d0)) / rho) : 0));
  const ra = ra0 + Math.atan2(x * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - y * Math.sin(d0) * Math.sin(c)) * R2D;
  return { ra: ((ra % 360) + 360) % 360, dec: dec * R2D };
}

const normRa = (ra: number) => ((ra % 360) + 360) % 360;

const skyUrl = (sRa: number, sDec: number, sFov: number, w: number, h: number, surveyId: string) =>
  `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=${encodeURIComponent(surveyId)}&ra=${sRa.toFixed(2)}&dec=${sDec.toFixed(2)}&fov=${sFov.toFixed(2)}&width=${w}&height=${h}&projection=SIN&coordsys=icrs&rotation=0&format=jpg`;

/** Low-precision Sun position (~0.01°). */
export function sunRaDec(date: Date): { ra: number; dec: number } {
  const d = date.getTime() / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * R2D;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) * R2D;
  return { ra: normRa(ra), dec };
}

/** Truncated lunar theory (~0.2°): enough for a sky marker. */
export function moonRaDec(date: Date): { ra: number; dec: number; illum: number } {
  const d = date.getTime() / 86400000 - 10957.5;
  const L0 = normRa(218.316 + 13.176396 * d);
  const Mm = normRa(134.963 + 13.064993 * d) * D2R;
  const Ms = normRa(357.529 + 0.98560028 * d) * D2R;
  const D = normRa(297.85 + 12.190749 * d) * D2R;
  const F = normRa(93.272 + 13.229350 * d) * D2R;
  const lon = L0 + 6.289 * Math.sin(Mm)
    + 1.274 * Math.sin(2 * D - Mm) + 0.658 * Math.sin(2 * D)
    - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F);
  const lat = 5.128 * Math.sin(F)
    + 0.281 * Math.sin(Mm + F) + 0.278 * Math.sin(Mm - F)
    + 0.173 * Math.sin(2 * D - F);
  const e = (23.439 - 0.00000036 * d) * D2R;
  const lo = lon * D2R;
  const la = lat * D2R;
  const ra = Math.atan2(Math.sin(lo) * Math.cos(e) - Math.tan(la) * Math.sin(e), Math.cos(lo)) * R2D;
  const dec = Math.asin(Math.sin(la) * Math.cos(e) + Math.cos(la) * Math.sin(e) * Math.sin(lo)) * R2D;
  const sun = sunRaDec(date);
  let elong = Math.abs(normRa(sun.ra) - normRa(ra));
  if (elong > 180) elong = 360 - elong;
  return { ra: normRa(ra), dec, illum: (1 - Math.cos(elong * D2R)) / 2 };
}

/**
 * Stellarium-style observer view: real HiPS sky (SIN projection) + constellation
 * lines + equatorial grid + cardinal points from observer lat/lon + live clock.
 * Drag to look around, scroll to zoom, click to inspect.
 */
export default function StellariumView({
  focus, onInspect, initial, liveStars,
}: {
  focus: StelFocus | null;
  onInspect: (ra: number, dec: number) => void;
  initial: { ra: number; dec: number };
  liveStars: boolean;
}) {
  const [ra, setRa] = useState(initial.ra);
  const [dec, setDec] = useState(initial.dec);
  const [fov, setFov] = useState(45);
  const [survey, setSurvey] = useState(SURVEYS[0].id);
  const [showLines, setShowLines] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showStars, setShowStars] = useState(true);
  const [obs, setObs] = useState<Observer>({ lat: 23.81, lon: 90.41, name: 'Dhaka (default)' });
  const [now, setNow] = useState(() => new Date());
  const [offH, setOffH] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<{ ra: number; dec: number; alt: number; az: number } | null>(null);
  const [lines, setLines] = useState<ConLines | null>(null);
  const [stars, setStars] = useState<Array<{ ra: number; dec: number; g_mag: number | null }>>([]);
  const t = new Date(now.getTime() + offH * 3600e3);
  const tMin = Math.floor(t.getTime() / 60000);
  const tNow = useMemo(() => new Date(tMin * 60000), [tMin]);

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ ra: initial.ra, dec: initial.dec, fov: 45, survey: SURVEYS[0].id, showLines: true, showGrid: true });
  const drag = useRef<{ x: number; y: number; ra: number; dec: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; fov: number } | null>(null);

  // mirror latest view for canvas callbacks (synced in an effect, never during render)
  useEffect(() => {
    view.current = { ra, dec, fov, survey, showLines, showGrid };
  });

  // focus jumps (search)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focus) { setRa(normRa(focus.ra)); setDec(Math.max(-85, Math.min(85, focus.dec))); }
  }, [focus]);

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // constellation lines (device cache first, network once)
  useEffect(() => {
    let alive = true;
    const cached = lsGet<ConLines>('sh-lines-v1');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setLines(cached);
    void loadLines().then((l) => {
      if (!alive || !l) return;
      setLines(l);
      lsSet('sh-lines-v1', l, 10);
    });
    return () => { alive = false; };
  }, []);

  // Gaia catalog stars for this view (debounced; cached server-side 30d)
  useEffect(() => {
    if (!liveStars || !API_BASE) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fov > 60) { setStars([]); return; }
    const t = setTimeout(() => {
      const url = `${API_BASE}/api/stars?ra=${ra.toFixed(2)}&dec=${dec.toFixed(2)}&fov_deg=${fov.toFixed(1)}`;
      let alive = true;
      void fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (alive && j && Array.isArray(j.stars)) setStars(j.stars);
      }).catch(() => undefined);
      return () => { alive = false; };
    }, 800);
    return () => clearTimeout(t);
  }, [ra, dec, fov, liveStars]);

  // geolocation on demand
  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setObs({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), name: 'You (GPS)' }),
      () => undefined,
      { timeout: 8000 },
    );
  }, []);

  // sky image: snapped tiles (map-style) + two-stage preview + device cache.
  // Background snaps to a coarse grid so pans/zooms reuse cached tiles;
  // vector overlays track the exact view every frame. Veil only on first load.
  const qStep = Math.max(0.05, fov / 40);
  const raQ = Math.round(ra / qStep) * qStep;
  const decQ = Math.round(dec / qStep) * qStep;
  const fovQ = Math.min(90, Math.max(0.5, 0.5 * Math.pow(1.25, Math.round(Math.log(fov / 0.5) / Math.log(1.25)))));
  const firstLoad = useRef(true);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (firstLoad.current) setLoading(true);
    let alive = true;
    const W = Math.min(1200, Math.max(320, Math.round(host.clientWidth)));
    const H = Math.min(1200, Math.max(320, Math.round(host.clientHeight)));
    const v = view.current;
    // stage 1: tiny fast preview so motion feels instant
    const pv = setTimeout(() => {
      const url = skyUrl(raQ, decQ, fovQ, 384, 288, v.survey);
      void loadCachedImage(url)
        .then(() => cachedImageSrc(url))
        .then((src) => {
          if (!alive) return;
          firstLoad.current = false;
          setLoading(false);
          setImg(src);
        })
        .catch(() => undefined);
    }, 120);
    // stage 2: full-res refine once settled
    const full = setTimeout(() => {
      const url = skyUrl(raQ, decQ, fovQ, W, H, v.survey);
      void loadCachedImage(url)
        .then(() => cachedImageSrc(url))
        .then((src) => {
          if (!alive) return;
          firstLoad.current = false;
          setLoading(false);
          setImg(src);
        })
        .catch(() => undefined);
      // neighbor prefetch at snapped coords
      const off = fovQ * 0.5;
      prefetch([
        skyUrl(raQ, Math.max(-85, Math.min(85, decQ + off)), fovQ, W, H, v.survey),
        skyUrl(raQ, Math.max(-85, Math.min(85, decQ - off)), fovQ, W, H, v.survey),
        skyUrl(normRa(raQ + off), decQ, fovQ, W, H, v.survey),
        skyUrl(normRa(raQ - off), decQ, fovQ, W, H, v.survey),
      ]);
    }, 900);
    return () => { alive = false; clearTimeout(pv); clearTimeout(full); };
  }, [raQ, decQ, fovQ, survey]);

  // overlays
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const v = view.current;
      // screen mapping mirrors X: background FITS has RA increasing LEFT,
      // overlay math uses RA increasing RIGHT — consistent in both directions
      const scale = (w / 2) / Math.tan((v.fov / 2) * D2R);
      const toXY = (pRa: number, pDec: number): { x: number; y: number } | null => {
        const p = project(normRa(pRa), pDec, v.ra, v.dec);
        if (!p) return null;
        return { x: w / 2 - p.x * scale, y: h / 2 - p.y * scale };
      };

      // equatorial grid
      if (v.showGrid) {
        const step = v.fov > 60 ? 30 : v.fov > 25 ? 10 : v.fov > 8 ? 5 : v.fov > 2.5 ? 1 : 0.5;
        ctx.lineWidth = 1;
        ctx.font = '10px ui-monospace, monospace';
        // meridians
        for (let r = 0; r < 360; r += step) {
          ctx.strokeStyle = r % 90 === 0 ? 'rgba(140,170,255,.30)' : 'rgba(140,170,255,.14)';
          ctx.beginPath();
          let started = false;
          for (let d = -85; d <= 85; d += 2) {
            const s = toXY(r, d);
            if (!s) { started = false; continue; }
            if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();
          const lab = toXY(r, Math.max(-80, Math.min(80, v.dec)));
          if (lab && lab.x > 0 && lab.x < w) {
            ctx.fillStyle = 'rgba(160,180,230,.6)';
            ctx.fillText(`${(r / 15).toFixed(0)}h`, lab.x + 3, Math.max(12, Math.min(h - 4, lab.y - 4)));
          }
        }
        // parallels
        for (let d = -75; d <= 75; d += step) {
          ctx.strokeStyle = d === 0 ? 'rgba(140,170,255,.30)' : 'rgba(140,170,255,.14)';
          ctx.beginPath();
          let started = false;
          for (let r = 0; r <= 360; r += 2) {
            const s = toXY(r, d);
            if (!s) { started = false; continue; }
            if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
          }
          ctx.stroke();
        }
      }

      // constellation lines
      if (v.showLines && lines) {
        ctx.strokeStyle = 'rgba(120,200,255,.55)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const f of lines.features) {
          for (const line of f.geometry.coordinates) {
            let prev: { x: number; y: number } | null = null;
            for (const [lr, ld] of line) {
              const s = toXY(normRa(lr), ld);
              if (!s) { prev = null; continue; }
              if (prev && Math.hypot(s.x - prev.x, s.y - prev.y) < Math.max(w, h) * 0.5) {
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(s.x, s.y);
              }
              prev = s;
            }
          }
        }
        ctx.stroke();
        // labels at first point
        ctx.font = '11px system-ui';
        ctx.fillStyle = 'rgba(150,210,255,.75)';
        for (const f of lines.features) {
          const first = f.geometry.coordinates[0]?.[0];
          if (!first) continue;
          const s = toXY(normRa(first[0]), first[1]);
          if (s && s.x > 0 && s.x < w && s.y > 0 && s.y < h) ctx.fillText(f.id, s.x + 5, s.y - 5);
        }
      }
      // Gaia catalog stars (real positions, size by G mag)
      if (showStars && stars.length) {
        for (const s of stars) {
          const p = toXY(normRa(s.ra), s.dec);
          if (!p || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) continue;
          const g = s.g_mag ?? 14;
          const r = Math.min(3.2, Math.max(0.7, 3.4 - (g - 6) * 0.32));
          if (g < 9) {
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
            glow.addColorStop(0, 'rgba(200,220,255,.5)');
            glow.addColorStop(1, 'rgba(200,220,255,0)');
            ctx.fillStyle = glow;
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = g < 11 ? '#e8efff' : 'rgba(220,228,245,.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        }
      }

      // Sun + Moon markers (computed locally, real positions)
      try {
        const sun = sunRaDec(tNow);
        const sp = toXY(sun.ra, sun.dec);
        if (sp && sp.x > 0 && sp.x < w && sp.y > 0 && sp.y < h) {
          const glow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 26);
          glow.addColorStop(0, 'rgba(255,210,90,.85)');
          glow.addColorStop(1, 'rgba(255,210,90,0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, TAU); ctx.fill();
          ctx.font = '11px system-ui';
          ctx.fillText('Sun', sp.x + 10, sp.y + 4);
        }
        const moon = moonRaDec(tNow);
        const mp = toXY(moon.ra, moon.dec);
        if (mp && mp.x > 0 && mp.x < w && mp.y > 0 && mp.y < h) {
          ctx.fillStyle = '#dfe6f2';
          ctx.beginPath(); ctx.arc(mp.x, mp.y, 5.5, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(4,5,10,.55)';
          ctx.beginPath(); ctx.arc(mp.x + 5.5 * (1 - moon.illum * 2) * 0.9, mp.y, 5, 0, TAU); ctx.fill();
          ctx.font = '11px system-ui';
          ctx.fillStyle = 'rgba(223,230,242,.9)';
          ctx.fillText(`Moon ${Math.round(moon.illum * 100)}%`, mp.x + 10, mp.y + 4);
        }
      } catch { /* markers are best-effort */ }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ra, dec, fov, lines, showGrid, showLines, stars, showStars, tNow]);

  // non-passive wheel zoom at VIEW level: every wheel over the sky zooms,
  // except inside real controls (search/tools/inspector/selects keep native scroll)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest?.('.map-tools, .inspector, select, button, input, a')) return;
      e.preventDefault();
      e.stopPropagation();
      setFov((f) => Math.min(90, Math.max(0.5, f * (e.deltaY > 0 ? 1.15 : 0.87))));
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  const centerAltAz = altAz(ra, dec, obs.lat, obs.lon, t);

  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ra, dec, moved: false };
    } else {
      drag.current = null; // multi-touch: pinch takes over, pan pauses
      const pts = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), fov };
    }
  };
  const move = (e: React.PointerEvent) => {
    const host = hostRef.current;
    if (!host) return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // pinch zoom with two fingers
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      if (pinch.current) {
        const ratio = dist / Math.max(20, pinch.current.dist);
        setFov(Math.min(90, Math.max(0.5, pinch.current.fov / ratio)));
      } else {
        pinch.current = { dist, fov };
      }
      return;
    }
    const r = host.getBoundingClientRect();
    const scale = (r.width / 2) / Math.tan((view.current.fov / 2) * D2R);
    const x = -((e.clientX - r.left - r.width / 2) / scale);
    const y = -((e.clientY - r.top - r.height / 2) / scale);
    const p = unproject(x, y, view.current.ra, view.current.dec);
    if (p.dec >= -90 && p.dec <= 90) {
      const a = altAz(p.ra, p.dec, obs.lat, obs.lon, t);
      setCursor({ ...p, ...a });
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
    else return;
    // drag sky with the pointer (mirrored X mapping: center moves +RA when dragged right)
    const degPerPx = view.current.fov / r.width;
    setRa(normRa(drag.current.ra + dx * degPerPx / Math.max(0.3, Math.cos(view.current.dec * D2R))));
    setDec(Math.max(-88, Math.min(88, drag.current.dec + dy * degPerPx)));
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // drop back to single-finger pan from the remaining finger
      const [id, pt] = [...pointers.current.entries()][0];
      void id;
      drag.current = { x: pt.x, y: pt.y, ra, dec, moved: true };
      return;
    }
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (wasDrag) return;
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const scale = (r.width / 2) / Math.tan((view.current.fov / 2) * D2R);
    const p = unproject(-((e.clientX - r.left - r.width / 2) / scale), -((e.clientY - r.top - r.height / 2) / scale), view.current.ra, view.current.dec);
    if (p.dec >= -90 && p.dec <= 90) onInspect(p.ra, p.dec);
  };

  // cardinal points: horizon (alt 0) at 4 azimuths, projected via altaz->radec inverse is
  // complex; instead show azimuth of view center + N/E/S/W edge hints from center az.
  const cardinals: Array<{ label: string; az: number }> = [
    { label: 'N', az: 0 }, { label: 'E', az: 90 }, { label: 'S', az: 180 }, { label: 'W', az: 270 },
  ];
  const centerAz = centerAltAz.az;

  return (
    <div className="stel" ref={hostRef}>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" aria-hidden="true" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <canvas ref={canvasRef} role="img"
        aria-label={`Observer sky view centered RA ${ra.toFixed(1)}, Dec ${dec.toFixed(1)}, field ${fov.toFixed(0)} degrees. Drag to look, scroll to zoom, click to inspect.`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onPointerLeave={() => { pointers.current.clear(); pinch.current = null; drag.current = null; setCursor(null); }}
      />
      {loading && !img && <div className="stel-load">Loading real sky…</div>}
      {loading && img && <div className="stel-sync" aria-hidden="true"><span /></div>}

      {/* cardinal ring */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 14, fontFamily: 'monospace', fontSize: 13 }}>
        {cardinals.map((c) => {
          let d = Math.abs(centerAz - c.az) % 360;
          if (d > 180) d = 360 - d;
          const on = d < 45;
          return (
            <span key={c.label} style={{
              width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: '50%',
              color: on ? '#fff' : 'rgba(238,240,248,.45)',
              border: on ? '1px solid rgba(255,255,255,.8)' : '1px solid transparent',
              background: on ? 'rgba(5,6,12,.6)' : 'transparent',
            }}>{c.label}</span>
          );
        })}
      </div>

      {/* HUD */}
      <div className="stel-hud">
        <button type="button" className="epoch-chip" onClick={locate} title="Use device location">📍 {obs.name}</button>
        <span className="mono">{t.toLocaleDateString()} {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span role="group" aria-label="Time step" style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="epoch-chip" onClick={() => setOffH((h) => h - 1)} title="Back 1 hour">−1h</button>
          <button type="button" className="epoch-chip" onClick={() => setOffH((h) => h + 1)} title="Forward 1 hour">+1h</button>
          {offH !== 0 && <button type="button" className="epoch-chip" onClick={() => setOffH(0)}>Now</button>}
        </span>
        <span className="mono">Alt {centerAltAz.alt.toFixed(1)}° Az {centerAltAz.az.toFixed(1)}°</span>
        <span className="mono">FOV {fov < 10 ? fov.toFixed(1) : fov.toFixed(0)}°</span>
        {cursor && <span className="mono">→ RA {cursor.ra.toFixed(2)}° Dec {cursor.dec.toFixed(2)}°</span>}
        <select value={survey} onChange={(e) => setSurvey(e.target.value)} aria-label="Sky survey"
          style={{ background: '#151929', border: '1px solid var(--line)', borderRadius: 8, padding: '3px 6px', fontSize: 12 }}>
          {SURVEYS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className="epoch-chip" aria-pressed={showStars} onClick={() => setShowStars((v) => !v)} title="Gaia catalog stars">Stars</button>
        <button type="button" className="epoch-chip" aria-pressed={showLines} onClick={() => setShowLines((v) => !v)}>Figures</button>
        <button type="button" className="epoch-chip" aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>Grid</button>
      </div>
    </div>
  );
}
