'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { BANDS } from '@/lib/sky';
import { CHANNELS, applyStretch, colormap, type Colormap, type Stretch } from '@/lib/astro';
import { detectMotion, sampleGray, type MotionCandidate } from '@/lib/motion';

export interface BlinkFrame {
  label: string;
  png?: string | null;
  note?: string;
  obs_id?: string;
  mjd?: number;
}

export type CompareMode = 'blink' | 'side' | 'swipe' | 'diff';

/** Load an image element with CORS-clean pixels for canvas sampling. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load ${src}`));
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, pan: { x: number; y: number }, zoom: number) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2 + pan.x;
  const dy = (h - dh) / 2 + pan.y;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Apply stretch/colormap/invert to canvas in place. */
function stylize(canvas: HTMLCanvasElement, stretch: Stretch, vmin: number, vmax: number, invert: boolean, cm: Colormap, diffMode: boolean, diffScale: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const px = data.data;
  const span = Math.max(1e-6, vmax - vmin);
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    let t: number;
    if (diffMode) {
      t = Math.min(1, Math.max(0, 0.5 + ((lum - 0.5) * diffScale)));
      t = applyStretch(Math.abs(t - 0.5) * 2, stretch) * Math.sign(t - 0.5) * 0.5 + 0.5;
      if (invert) t = 1 - t;
    } else {
      t = (lum - vmin) / span;
      t = Math.min(1, Math.max(0, t));
      t = applyStretch(t, stretch);
      if (invert) t = 1 - t;
    }
    const [r, g, b] = colormap(t, cm);
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

const rowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
const selStyle: React.CSSProperties = { background: '#151929', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px', fontSize: 13 };

export default function BlinkComparator({
  frames, band, onBandChange, title, mode, onModeChange, epochIdx, onEpochChange,
  showMarkers, onToggleMarkers, fovArcmin = 10, onSample, center,
}: {
  frames: BlinkFrame[]; band: number; onBandChange: (b: number) => void; title: string;
  mode: CompareMode; onModeChange: (m: CompareMode) => void;
  epochIdx: number; onEpochChange: (i: number) => void;
  showMarkers: boolean; onToggleMarkers?: () => void; fovArcmin?: number;
  onSample?: (args: { x: number; y: number; values: number[] }) => void;
  center?: { ra: number; dec: number };
}) {
  const n = frames.length;
  const idx = Math.min(epochIdx, n - 1);
  const prevIdx = (idx - 1 + n) % n;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(550);
  const [palette, setPalette] = useState(false);
  const [palQ, setPalQ] = useState('');
  type Pop = null | 'tune' | 'bands' | 'data' | 'export' | 'keys';
  const [dock, setDock] = useState<Pop>(null);
  const [anchor, setAnchor] = useState<{
    x: number; top?: number; bottom?: number; maxH: number;
  } | null>(null);
  const openPop = (d: Exclude<Pop, null>) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const panelW = Math.min(440, window.innerWidth - 16);
    const x = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    // open where space is: below by default, above when cramped there
    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      setAnchor({ x, top: r.bottom + 8, maxH: Math.max(160, Math.floor(spaceBelow)) });
    } else {
      setAnchor({ x, bottom: window.innerHeight - r.top + 8, maxH: Math.max(160, Math.floor(spaceAbove)) });
    }
    setDock((cur) => (cur === d ? null : d));
  };
  const popStyle: React.CSSProperties | undefined = anchor
    ? { left: anchor.x, top: anchor.top, bottom: anchor.bottom, maxHeight: anchor.maxH }
    : undefined;
  const [stretch, setStretch] = useState<Stretch>('asinh');
  const [cmap, setCmap] = useState<Colormap>('cividis');
  const [invert, setInvert] = useState(false);
  const [vmin, setVmin] = useState(0.05);
  const [vmax, setVmax] = useState(0.98);
  const [diffScale, setDiffScale] = useState(3);
  const [swipe, setSwipe] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [channel, setChannel] = useState<number>(() => {
    const ch = CHANNELS.filter((c) => c.detector === band);
    return ch[Math.floor(ch.length / 2)]?.idx ?? 0;
  });
  const [rgb, setRgb] = useState<[number, number, number]>([16, 33, 50]);
  const [showRgb, setShowRgb] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const [recording, setRecording] = useState(false);
  const [probe, setProbe] = useState<{ sx: number; sy: number; lum: number; ra: number; dec: number } | null>(null);

  const mainRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [sizeTick, setSizeTick] = useState(0);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const diffStatRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null);
  const probeSrc = useRef<{ img: HTMLImageElement; w: number; h: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // preload frames progressively (each arrival re-renders; no blank wait)
  useEffect(() => {
    let alive = true;
    const urls = [...new Set(frames.map((f) => f.png).filter((u): u is string => !!u))];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded({});
    for (const u of urls) {
      void loadImage(u).then((img) => {
        if (alive) setLoaded((m) => (m[u] ? m : { ...m, [u]: img }));
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [frames]);

  // autoplay
  useEffect(() => {
    if (!playing || n < 2) return;
    timer.current = setInterval(() => onEpochChange((idx + 1) % n), speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, n, idx, onEpochChange]);

  // reduced motion: never autoplay
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  const step = useCallback((d: number) => {
    setPlaying(false);
    onEpochChange((idx + d + n) % n);
  }, [idx, n, onEpochChange]);

  const cur = frames[idx];
  const prev = frames[prevIdx];
  const curLbl = cur?.label ?? '—';
  const downloadPNG = useCallback(() => {
    const canvas = mode === 'side' ? rightRef.current : mainRef.current;
    if (!canvas || curLbl === '—') return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `spectrahunt-${curLbl.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
  }, [mode, curLbl]);

  const copyLink = useCallback(() => {
    void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  }, []);

  // keyboard: transport + palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if ((mod && e.key.toLowerCase() === 'k') || e.key === '/') {
        const tag = (e.target as HTMLElement).tagName;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
          e.preventDefault();
          setPalette((p) => !p);
          setPalQ('');
          return;
        }
      }
      if (e.key === 'Escape') {
        if (palette) setPalette(false);
        return;
      }
      if (mod || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => (n > 1 ? !p : p)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, n, palette]);

  // non-passive wheel zoom + resize redraw
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(6, Math.max(0.6, z * (e.deltaY > 0 ? 0.92 : 1.09))));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(stage);
    const onRs = () => setDock(null);
    window.addEventListener('resize', onRs);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onRs);
      ro.disconnect();
    };
  }, []);

  const curImg = cur?.png ? loaded[cur.png] : undefined;
  const prevImg = prev?.png ? loaded[prev.png] : undefined;
  // real motion candidates from the actual pixels (recomputed when frames arrive)
  const candidates: MotionCandidate[] = useMemo(() => {
    if (!curImg || !prevImg) return [];
    try {
      const a = sampleGray(prevImg);
      const b = sampleGray(curImg);
      if (!a || !b) return [];
      return detectMotion(a, b);
    } catch {
      return [];
    }
  }, [curImg, prevImg]);
  const bandMeta = BANDS[band - 1];
  const detChannels = useMemo(() => CHANNELS.filter((c) => c.detector === band), [band]);

  // probe source: natural-res offscreen of current frame
  useEffect(() => {
    if (!curImg) { probeSrc.current = null; return; }
    const c = document.createElement('canvas');
    c.width = curImg.naturalWidth || curImg.width;
    c.height = curImg.naturalHeight || curImg.height;
    const cctx = c.getContext('2d', { willReadFrequently: true });
    if (!cctx) { probeSrc.current = null; return; }
    cctx.drawImage(curImg, 0, 0);
    probeSrc.current = { img: curImg, w: c.width, h: c.height };
    (probeSrc as { canvas?: HTMLCanvasElement }).canvas = c;
  }, [curImg]);

  // render main canvas + histogram + diff stats (DOM-direct, no react state)
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const w = host.clientWidth;
    const h = host.clientHeight || host.clientWidth;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);

    const mk = (img: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = Math.round(w); c.height = Math.round(h);
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (cctx) drawCover(cctx, img, w, h, pan, zoom);
      return cctx?.getImageData(0, 0, c.width, c.height);
    };

    if (mode === 'side') return;
    let diffMode = false;
    if (showRgb && curImg && prevImg) {
      const A = mk(prevImg);
      const B = mk(curImg);
      if (A && B) {
        const out = ctx.createImageData(Math.round(w), Math.round(h));
        const span = Math.max(1e-6, vmax - vmin);
        const norm = (lum: number) => {
          let t = Math.min(1, Math.max(0, (lum - vmin) / span));
          t = applyStretch(t, stretch);
          return invert ? 1 - t : t;
        };
        for (let i = 0; i < out.data.length; i += 4) {
          const la = (A.data[i] * 0.299 + A.data[i + 1] * 0.587 + A.data[i + 2] * 0.114) / 255;
          const lb = (B.data[i] * 0.299 + B.data[i + 1] * 0.587 + B.data[i + 2] * 0.114) / 255;
          out.data[i] = Math.round(norm(lb) * 255);
          out.data[i + 1] = Math.round(norm(la) * 255);
          out.data[i + 2] = Math.round(Math.min(1, Math.abs(lb - la) * 2.5) * 255);
          out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
      }
    } else if (mode === 'diff' && curImg && prevImg) {
      diffMode = true;
      const A = mk(prevImg);
      const B = mk(curImg);
      if (A && B) {
        const out = ctx.createImageData(Math.round(w), Math.round(h));
        for (let i = 0; i < out.data.length; i += 4) {
          const la = (A.data[i] * 0.299 + A.data[i + 1] * 0.587 + A.data[i + 2] * 0.114) / 255;
          const lb = (B.data[i] * 0.299 + B.data[i + 1] * 0.587 + B.data[i + 2] * 0.114) / 255;
          const g = Math.round(((lb - la) * 0.5 + 0.5) * 255);
          out.data[i] = g; out.data[i + 1] = g; out.data[i + 2] = g; out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        stylize(canvas, stretch, vmin, vmax, invert, cmap, true, diffScale);
      }
    } else if (mode === 'swipe' && curImg && prevImg) {
      const off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      const octx = off.getContext('2d');
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCover(octx, prevImg, w, h, pan, zoom);
        octx.save();
        octx.beginPath();
        octx.rect(swipe * w, 0, w - swipe * w, h);
        octx.clip();
        drawCover(octx, curImg, w, h, pan, zoom);
        octx.restore();
        ctx.drawImage(off, 0, 0, w, h);
        stylize(canvas, stretch, vmin, vmax, invert, cmap, false, diffScale);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(swipe * w, 0); ctx.lineTo(swipe * w, h); ctx.stroke();
      }
    } else if (curImg) {
      drawCover(ctx, curImg, w, h, pan, zoom);
      stylize(canvas, stretch, vmin, vmax, invert, cmap, false, diffScale);
    } else {
      ctx.fillStyle = '#aab0c8';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Cutout pending — story + metadata below work offline.', w / 2, h / 2);
    }

    // REAL mover/variable markers from pixel differencing (not demo positions)
    if (showMarkers && candidates.length && curImg) {
      const iw = curImg.naturalWidth || curImg.width;
      const ih = curImg.naturalHeight || curImg.height;
      const sc = Math.max(w / iw, h / ih) * zoom;
      const dw = iw * sc;
      const dh = ih * sc;
      const ox = (w - dw) / 2 + pan.x;
      const oy = (h - dh) / 2 + pan.y;
      candidates.forEach((c, i) => {
        const X = ox + c.x * dw;
        const Y = oy + c.y * dh;
        if (X < -20 || X > w + 20 || Y < -20 || Y > h + 20) return;
        const isMover = c.kind === 'mover';
        ctx.strokeStyle = isMover ? '#f0bb52' : '#5aa9e6';
        ctx.fillStyle = isMover ? '#f0bb52' : '#5aa9e6';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(X - 8, Y - 8, 16, 16);
        if (isMover) {
          const x0 = X - (c.dx * dw) / 2;
          const y0 = Y - (c.dy * dh) / 2;
          const x1 = X + (c.dx * dw) / 2;
          const y1 = Y + (c.dy * dh) / 2;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x1, y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '600 10px ui-monospace, monospace';
        ctx.fillText(`${isMover ? 'M' : 'V'}${i + 1} ${c.sigma.toFixed(0)}σ`, X + 11, Y - 9);
      });
    }
    ctx.fillStyle = 'rgba(238,240,248,.85)';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('N ↑   E ←', 14, 22);
    const barW = Math.max(30, w / fovArcmin);
    ctx.fillRect(w - barW - 14, h - 18, barW, 3);
    ctx.textAlign = 'right';
    ctx.fillText('1′', w - 14, h - 24);
    ctx.textAlign = 'left';

    // histogram + diff stats, drawn DOM-direct (no react state churn)
    try {
      const id = ctx.getImageData(0, 0, Math.round(w), Math.round(h));
      const bins = new Array<number>(48).fill(0);
      let hot = 0;
      const d = id.data;
      for (let i = 0; i < d.length; i += 16) {
        const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        bins[Math.min(47, Math.floor(lum * 48))]++;
        if (diffMode && Math.abs(lum - 0.5) > 0.2) hot++;
      }
      const hc = histRef.current;
      if (hc) {
        const hw = (hc.width = 220);
        const hh = (hc.height = 44);
        const hctx = hc.getContext('2d');
        if (hctx) {
          hctx.clearRect(0, 0, hw, hh);
          const mx = Math.max(1, ...bins);
          hctx.fillStyle = diffMode ? '#e8c34a' : '#7c83fd';
          bins.forEach((v, bi) => {
            const bh = Math.max(1, (v / mx) * (hh - 4));
            hctx.fillRect((bi / bins.length) * hw, hh - bh, hw / bins.length - 0.5, bh);
          });
        }
      }
      if (diffStatRef.current) {
        const total = d.length / 16;
        diffStatRef.current.textContent = diffMode
          ? `${((hot / total) * 100).toFixed(1)}% pixels strongly changed`
          : '';
      }
    } catch { /* tainted or tiny canvas */ }
  }, [curImg, prevImg, mode, stretch, vmin, vmax, invert, cmap, diffScale, swipe, pan, zoom, showMarkers, showRgb, fovArcmin, candidates, sizeTick]);

  // side-by-side render (synchronized pan/zoom)
  useEffect(() => {
    if (mode !== 'side') return;
    for (const [ref, img] of [[leftRef, prevImg], [rightRef, curImg]] as const) {
      const canvas = ref.current;
      if (!canvas) continue;
      const host = canvas.parentElement;
      if (!host) continue;
      const w = host.clientWidth;
      const h = host.clientWidth;
      if (!w || !h) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, w, h);
      if (img) {
        drawCover(ctx, img, w, h, pan, zoom);
        stylize(canvas, stretch, vmin, vmax, invert, cmap, false, diffScale);
      }
    }
  }, [mode, prevImg, curImg, pan, zoom, stretch, vmin, vmax, invert, cmap, diffScale]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pan: { ...pan }, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === 'swipe' && e.buttons === 0 && e.pointerType === 'mouse') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSwipe(Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)));
    }
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
      else return;
      setPan({ x: drag.current.pan.x + dx, y: drag.current.pan.y + dy });
      return;
    }
    // hover probe: sample source pixels + approximate sky offset
    if (e.pointerType === 'touch' || !probeSrc.current || !curImg) { setProbe(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const src = probeSrc.current;
    const scale = Math.max(r.width / src.w, r.height / src.h) * zoom;
    const dx = (r.width - src.w * scale) / 2 + pan.x;
    const dy = (r.height - src.h * scale) / 2 + pan.y;
    const px = Math.floor((e.clientX - r.left - dx) / scale);
    const py = Math.floor((e.clientY - r.top - dy) / scale);
    if (px < 0 || py < 0 || px >= src.w || py >= src.h) { setProbe(null); return; }
    try {
      const c = (probeSrc as { canvas?: HTMLCanvasElement }).canvas;
      const v = c?.getContext('2d', { willReadFrequently: true })?.getImageData(px, py, 1, 1).data;
      if (!v) { setProbe(null); return; }
      const lum = Math.round(v[0] * 0.299 + v[1] * 0.587 + v[2] * 0.114);
      // ≈6.2″/px at zoom 1 from field center; screen-right = −RA (mirrored), screen-down = −Dec
      const offX = ((px - src.w / 2) * 6.2) / zoom;
      const offY = ((py - src.h / 2) * 6.2) / zoom;
      const ra = center ? center.ra - offX / 3600 / Math.max(0.2, Math.cos((center.dec * Math.PI) / 180)) : NaN;
      const dec = center ? center.dec - offY / 3600 : NaN;
      setProbe({ sx: e.clientX - r.left, sy: e.clientY - r.top, lum, ra, dec });
    } catch {
      setProbe(null);
    }
  };
  const onPointerUp = () => { drag.current = null; };
  const onClickSample = (e: React.MouseEvent) => {
    if (!onSample || drag.current?.moved) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const values = frames.map((f) => {
      const img = f.png ? loaded[f.png] : undefined;
      if (!img) return 0;
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cctx = c.getContext('2d');
      if (!cctx) return 0;
      cctx.drawImage(img, 0, 0, 32, 32);
      try {
        const d = cctx.getImageData(Math.floor(x * 31), Math.floor(y * 31), 1, 1).data;
        return Math.round((d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114) * 10) / 10;
      } catch { return 0; }
    });
    onSample({ x, y, values });
  };

  const recordWebM = async () => {
    const canvas = mode === 'side' ? rightRef.current : mainRef.current;
    if (!canvas || !canvas.width || n < 2 || recording) return;
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    setRecording(true);
    setPlaying(false);
    rec.start();
    for (let i = 0; i < n; i++) {
      onEpochChange(i);
      await new Promise((r) => setTimeout(r, Math.max(250, speed)));
    }
    rec.stop();
    const blob = await done;
    setRecording(false);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spectrahunt-blink.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const setPreset = (p: 'faint' | 'balanced' | 'bright') => {
    if (p === 'faint') { setVmin(0.02); setVmax(0.9); }
    if (p === 'balanced') { setVmin(0.05); setVmax(0.98); }
    if (p === 'bright') { setVmin(0.15); setVmax(1); }
  };

  const setBandAndChannel = (b: number) => {
    onBandChange(b);
    const ch = CHANNELS.filter((c) => c.detector === b);
    setChannel(ch[Math.floor(ch.length / 2)]?.idx ?? 0);
  };

  const modeLabel = mode === 'diff' ? 'Difference B−A' : mode === 'swipe' ? 'Swipe A | B' : mode === 'side' ? 'Side-by-side' : showRgb ? 'Motion color' : 'Blink';

  interface Cmd { name: string; hint: string; run: () => void }
  const commands: Cmd[] = [
      { name: playing ? 'Pause blink' : 'Play blink', hint: 'Space', run: () => setPlaying((p) => (n > 1 ? !p : p)) },
      { name: 'Next epoch', hint: '→', run: () => step(1) },
      { name: 'Previous epoch', hint: '←', run: () => step(-1) },
      ...frames.map((f, i) => ({ name: `Go to ${f.label}`, hint: `E${i + 1}`, run: () => { setPlaying(false); onEpochChange(i); } })),
      ...(['blink', 'side', 'swipe', 'diff'] as CompareMode[]).map((m) => ({
        name: `Mode: ${m}`, hint: '', run: () => onModeChange(m),
      })),
      { name: 'Toggle motion color', hint: '', run: () => setShowRgb((v) => !v) },
      ...(['linear', 'log', 'sqrt', 'asinh'] as Stretch[]).map((s) => ({
        name: `Stretch: ${s}`, hint: '', run: () => setStretch(s),
      })),
      ...(['cividis', 'grayscale', 'viridis', 'inferno'] as Colormap[]).map((c) => ({
        name: `Colormap: ${c}`, hint: '', run: () => setCmap(c),
      })),
      { name: 'Toggle invert', hint: '', run: () => setInvert((v) => !v) },
      ...BANDS.map((b) => ({ name: `Band ${b.label} (${b.range})`, hint: '', run: () => setBandAndChannel(b.id) })),
      { name: 'Reset view', hint: '', run: () => { setPan({ x: 0, y: 0 }); setZoom(1); } },
      { name: 'Download PNG', hint: '', run: () => downloadPNG() },
      { name: 'Record WebM', hint: '', run: () => void recordWebM() },
      { name: 'Copy share link', hint: '', run: () => copyLink() },
      ...(onToggleMarkers ? [{ name: 'Toggle mover markers', hint: '', run: onToggleMarkers }] : []),
    ];
  // eslint-disable-next-line react-hooks/refs -- commands only invoke the stable parent callback from events
  const palHits = commands.filter((c) => c.name.toLowerCase().includes(palQ.trim().toLowerCase())).slice(0, 12);

  return (
    <div className="deck">
      <div className="blink-grid">
        <div className="stage-col">
          <div className="stage-wrap square" ref={stageRef} style={{ touchAction: 'none' }}>
            {mode === 'side' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: '100%', height: '100%' }}>
                <div style={{ position: 'relative' }}>
                  <canvas ref={leftRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-label={`${title} — ${prev?.label}`} />
                  <span className="viewer-tag mono">{prev?.label ?? '—'}</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <canvas ref={rightRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-label={`${title} — ${cur?.label}`} />
                  <span className="viewer-tag epoch mono">{cur?.label ?? '—'}</span>
                </div>
              </div>
            ) : (
              <>
                <canvas
                  ref={mainRef}
                  id="blinkCanvas"
                  role="img"
                  aria-label={`${title} — ${cur?.label ?? 'no frame'}`}
                  style={{ width: '100%', height: '100%', display: 'block', cursor: onSample ? 'crosshair' : 'grab' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onClick={onClickSample}
                />
                <span className="viewer-tag mono">{modeLabel}</span>
                <span className="viewer-tag epoch mono">{cur?.label ?? '—'}</span>
              </>
            )}
          </div>
        <div className="controls-zone">
          <div className="transport-row glass" role="group" aria-label="Blink transport">
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous epoch">
              <Icon name="back" />
            </button>
            <button type="button" className="play mini" onClick={() => setPlaying((pp) => (n > 1 ? !pp : pp))}
              aria-label={playing ? 'Pause blink' : 'Play blink'}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next epoch">
              <Icon name="fwd" />
            </button>
            <input className="scrub" type="range" min={0} max={Math.max(0, n - 1)} step={1} value={idx}
              onChange={(e) => { setPlaying(false); onEpochChange(Number(e.target.value)); }}
              aria-label="Timeline scrub" aria-valuetext={cur?.label ?? ''} />
            <span className="mono epoch-name">{cur?.label ?? '—'}</span>
            <button type="button" className="epoch-chip" onClick={() => setPalette(true)} title="Command palette (Ctrl+K)">⌘K</button>
          </div>

        <div className="vtoolbar glass" role="toolbar" aria-label="View controls">
          <div className="seg" role="group" aria-label="Compare mode">
            {(['blink', 'side', 'swipe', 'diff'] as CompareMode[]).map((m) => (
              <button key={m} type="button" className={`seg-btn${mode === m ? ' active' : ''}`} aria-pressed={mode === m}
                onClick={() => onModeChange(m)}>
                {m === 'blink' ? 'Blink' : m === 'side' ? 'Side' : m === 'swipe' ? 'Swipe' : 'Diff'}
              </button>
            ))}
            <button type="button" className={`seg-btn${showRgb ? ' active' : ''}`} aria-pressed={showRgb}
              onClick={() => setShowRgb((v) => !v)} title="False-color: epoch B red, epoch A green">Color</button>
          </div>
          <span className="vsep" aria-hidden="true" />
          <button type="button" className={`toolbtn${dock === 'tune' ? ' active' : ''}`} aria-expanded={dock === 'tune'} onClick={openPop('tune')}>Adjust</button>
          <button type="button" className={`toolbtn${dock === 'bands' ? ' active' : ''}`} aria-expanded={dock === 'bands'} onClick={openPop('bands')}>Bands</button>
          <button type="button" className={`toolbtn${dock === 'data' ? ' active' : ''}`} aria-expanded={dock === 'data'} onClick={openPop('data')}>Measure</button>
          <span className="vsep" aria-hidden="true" />
          <button type="button" className={`toolbtn${dock === 'export' ? ' active' : ''}`} aria-expanded={dock === 'export'} onClick={openPop('export')} title="Save and export">Save</button>
          <button type="button" className={`toolbtn${dock === 'keys' ? ' active' : ''}`} aria-expanded={dock === 'keys'} onClick={openPop('keys')} title="Shortcuts and guide">?</button>
          {mode === 'diff' && (
            <label className="mini-slider"><span>Gain</span>
              <input type="range" min={1} max={8} step={0.5} value={diffScale} onChange={(e) => setDiffScale(Number(e.target.value))} aria-label="Difference gain" />
            </label>
          )}
          {mode === 'swipe' && (
            <label className="mini-slider"><span>Curtain</span>
              <input type="range" min={2} max={98} value={Math.round(swipe * 100)} onChange={(e) => setSwipe(Number(e.target.value) / 100)} aria-label="Swipe position" />
            </label>
          )}
        </div>
{dock && <div className="pop-veil" onMouseDown={() => setDock(null)} />}
        {dock === 'tune' && (
          <div className="popover glass" style={popStyle} role="dialog" aria-label="Adjust">
            <div className="pop-head"><span>Adjust</span><button type="button" className="icon-btn sm" aria-label="Close Adjust panel" onClick={() => setDock(null)}><Icon name="x" /></button></div>
            <div style={rowStyle}>
              <label style={{ fontSize: 13 }}>Stretch{' '}
                <select value={stretch} onChange={(e) => setStretch(e.target.value as Stretch)} style={selStyle}>
                  <option value="linear">linear</option>
                  <option value="log">log</option>
                  <option value="sqrt">sqrt</option>
                  <option value="asinh">asinh</option>
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Colors{' '}
                <select value={cmap} onChange={(e) => setCmap(e.target.value as Colormap)} style={selStyle}>
                  <option value="cividis">cividis ✓ colorblind-safe</option>
                  <option value="grayscale">grayscale</option>
                  <option value="viridis">viridis</option>
                  <option value="inferno">inferno</option>
                </select>
              </label>
              <button type="button" className="epoch-chip" aria-pressed={invert} onClick={() => setInvert((v) => !v)}
                style={invert ? { color: '#fff', borderColor: '#7c83fd' } : undefined}>Invert</button>
              {(['faint', 'balanced', 'bright'] as const).map((pp) => (
                <button key={pp} type="button" className="epoch-chip" onClick={() => setPreset(pp)}>{pp}</button>
              ))}
            </div>
            <label className="speed"><span>Black {Math.round(vmin * 100)}%</span>
              <input type="range" min={0} max={50} value={Math.round(vmin * 100)} onChange={(e) => setVmin(Number(e.target.value) / 100)} />
            </label>
            <label className="speed"><span>White {Math.round(vmax * 100)}%</span>
              <input type="range" min={50} max={100} value={Math.round(vmax * 100)} onChange={(e) => setVmax(Number(e.target.value) / 100)} />
            </label>
          </div>
        )}
{dock === 'bands' && (
          <div className="popover glass" style={popStyle} role="dialog" aria-label="Bands">
            <div className="pop-head"><span>Bands</span><button type="button" className="icon-btn sm" aria-label="Close Bands panel" onClick={() => setDock(null)}><Icon name="x" /></button></div>
            <div className="band-row" style={{ padding: 0, background: 'transparent' }}>
              {BANDS.map((b) => (
                <button key={b.id} type="button" className="band" style={{ ['--band-color' as string]: b.color }}
                  aria-pressed={b.id === band} title={`${b.label}: ${b.range}`} onClick={() => setBandAndChannel(b.id)}>
                  <span className="sw" style={{ background: b.color }} />{b.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#8a90ab' }}>{bandMeta.label} ({bandMeta.range}) · 102 channels · same-band blink only</p>
            <div style={rowStyle}>
              <label style={{ fontSize: 13 }}>Channel{' '}
                <select value={channel} onChange={(e) => setChannel(Number(e.target.value))} style={{ ...selStyle, maxWidth: 200 }} aria-label="Spectral channel">
                  {detChannels.map((c) => (
                    <option key={c.idx} value={c.idx}>#{c.idx + 1} · {c.wave_um.toFixed(2)} µm</option>
                  ))}
                </select>
              </label>
              <span style={{ fontSize: 13, color: '#8a90ab' }}>RGB</span>
              {(['R', 'G', 'B'] as const).map((k, ki) => (
                <select key={k} value={rgb[ki]} aria-label={`${k} channel`} style={selStyle}
                  onChange={(e) => setRgb(([r, g, b]) => { const v = [r, g, b] as [number, number, number]; v[ki] = Number(e.target.value); return v; })}>
                  {CHANNELS.map((c) => <option key={c.idx} value={c.idx}>{k} #{c.idx + 1}</option>)}
                </select>
              ))}
            </div>
          </div>
        )}
{dock === 'data' && (
          <div className="popover glass" style={popStyle} role="dialog" aria-label="Measure">
            <div className="pop-head"><span>Measure</span><button type="button" className="icon-btn sm" aria-label="Close Measure panel" onClick={() => setDock(null)}><Icon name="x" /></button></div>
            <div className="mono probe-line">
              {probe
                ? <>px {probe.lum}{Number.isFinite(probe.ra) ? <> · {probe.ra.toFixed(3)}°, {probe.dec >= 0 ? '+' : ''}{probe.dec.toFixed(3)}°</> : ' · hover'}</>
                : 'Hover the image to probe pixels'}
              {onSample ? ' · click for spectrum' : ''}
            </div>
            <canvas ref={histRef} className="hist" aria-label="Brightness histogram of the displayed frame" />
            <div style={{ fontSize: 12, color: '#8a90ab' }}>
              Change map: <span ref={diffStatRef} className="mono" style={{ color: '#e8c34a' }} />
              {mode !== 'diff' && <span className="mono"> — switch to Diff to quantify change</span>}
            </div>
            <div style={{ fontSize: 12, color: '#8a90ab' }}>
              {candidates.length
                ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} — real pixel differencing, ≥5σ`
                : 'Scanning pixels for movers…'}
            </div>
            {candidates.length > 0 ? (
              <ul className="cand-detect-list">
                {candidates.slice(0, 5).map((c, i) => (
                  <li key={i} className="mono">
                    <span className={c.kind === 'mover' ? 'tag-mover' : 'tag-var'}>
                      {c.kind === 'mover' ? 'MOVER' : 'VARIABLE'}
                    </span>{' '}
                    #{i + 1} · {c.sigma.toFixed(1)}σ
                  </li>
                ))}
              </ul>
            ) : (
              curImg && prevImg && (
                <p style={{ fontSize: 12, color: '#8a90ab' }}>No movers above 5σ between these epochs — quiet field.</p>
              )
            )}
          </div>
        )}
{dock === 'export' && (
          <div className="popover glass" style={popStyle} role="dialog" aria-label="Save">
            <div className="pop-head"><span>Save</span><button type="button" className="icon-btn sm" aria-label="Close Save panel" onClick={() => setDock(null)}><Icon name="x" /></button></div>
            <div style={rowStyle}>
              <button type="button" className="epoch-chip" onClick={() => downloadPNG()}>PNG</button>
              <button type="button" className="epoch-chip" onClick={() => void recordWebM()} disabled={recording || n < 2}>
                {recording ? 'Recording…' : 'WebM'}
              </button>
              <button type="button" className="epoch-chip" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset view</button>
              <button type="button" className="epoch-chip" onClick={() => copyLink()}>Copy link</button>
            </div>
          </div>
        )}
{dock === 'keys' && (
          <div className="popover glass" style={popStyle} role="dialog" aria-label="Guide">
            <div className="pop-head"><span>Guide</span><button type="button" className="icon-btn sm" aria-label="Close Guide panel" onClick={() => setDock(null)}><Icon name="x" /></button></div>
            <div className="keys-grid">
              <span><kbd>Space</kbd> play / pause</span>
              <span><kbd>←</kbd><kbd>→</kbd> step epoch</span>
              <span>drag pan · scroll zoom</span>
            </div>
            <button type="button" className="epoch-chip" onClick={() => setPalette(true)}>Command palette (Ctrl+K)</button>
          </div>
        )}
        </div>

          <div className="filmstrip" role="group" aria-label="Epoch filmstrip">
            {frames.map((f, i) => (
              <button key={f.label} type="button" onClick={() => { setPlaying(false); onEpochChange(i); }}
                className={`film${i === idx ? ' active' : ''}`} aria-pressed={i === idx} title={f.mjd ? `${f.label} · MJD ${f.mjd}` : f.label}>
                {f.png && loaded[f.png] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.png} alt="" draggable={false} />
                ) : (
                  <span className="film-empty">{f.mjd ? String(Math.round(f.mjd)).slice(2) : `E${i + 1}`}</span>
                )}
              </button>
            ))}
            <label className="rate">Rate
              <input type="range" min={150} max={1200} step={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Blink rate" />
            </label>
          </div>
        </div>


      </div>

      {/* command palette */}
      {palette && (
        <div className="pal-veil" onMouseDown={() => setPalette(false)}>
          <div className="palette glass" role="dialog" aria-modal="true" aria-label="Command palette"
            onMouseDown={(e) => e.stopPropagation()}>
            <input autoFocus value={palQ} onChange={(e) => setPalQ(e.target.value)}
              placeholder="Type a command or epoch…" aria-label="Command search"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && palHits[0]) { palHits[0].run(); setPalette(false); }
              }} />
            <div className="pal-list" role="listbox" aria-label="Commands">
              {palHits.map((c) => (
                <button key={c.name} type="button" role="option" aria-selected={false}
                  onClick={() => { c.run(); setPalette(false); }}>
                  <span>{c.name}</span>{c.hint && <kbd>{c.hint}</kbd>}
                </button>
              ))}
              {!palHits.length && <div className="s-empty">No matching command.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
