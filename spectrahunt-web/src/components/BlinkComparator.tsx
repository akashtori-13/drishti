'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Icon from '@/components/Icon';
import SpectrumPlot from '@/components/Plots';
import { BANDS } from '@/lib/sky';
import { CHANNELS, applyStretch, colormap, type Colormap, type Stretch } from '@/lib/astro';
import { assignTrackIds, buildTracks, detectMotion, sampleGrayAt, sampleGray, type TrackedCandidate, type Track } from '@/lib/motion';
import { loadCachedImage } from '@/lib/skycache';
import { useAppStore } from '@/lib/store';
import { API_BASE } from '@/lib/showcases';

export interface BlinkFrame {
  label: string;
  png?: string | null;
  note?: string;
  obs_id?: string;
  mjd?: number;
}

export type CompareMode = 'blink' | 'side' | 'swipe' | 'diff' | 'replay' | 'color';

/** Load an image through the device cache (memory → IndexedDB → network).
 * First visit fetches from the web; every later visit serves cache and never
 * touches the network for that URL. Bounded by `timeoutMs` (a late arrival
 * still warms the cache in the background for next time). */
function loadImage(src: string, timeoutMs = 20000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${src}`)), timeoutMs);
    void loadCachedImage(src).then(
      (img) => { clearTimeout(timer); resolve(img); },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(`Cannot load ${src}`)); },
    );
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

/** Realistic star: bright core, soft halo, diffraction spikes. Alpha scales all. */
function drawStarSprite(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  core: string, halo: string, alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, halo);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = halo;
  ctx.lineWidth = Math.max(1, r * 0.45);
  const L = r * 3.4;
  ctx.beginPath();
  ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
  ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Small solar-system body: coma glow, nucleus, dust tail opposite motion. */
function drawComet(
  ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number,
  color: string, alpha = 1,
) {
  const tx = -Math.cos(ang);
  const ty = -Math.sin(ang);
  const tailLen = size * 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  // dust tail: linear gradient triangle trailing behind
  const tg = ctx.createLinearGradient(x, y, x + tx * tailLen, y + ty * tailLen);
  tg.addColorStop(0, color);
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const px = -ty;
  const py = tx;
  ctx.lineTo(x + tx * tailLen + px * size * 0.9, y + ty * tailLen + py * size * 0.9);
  ctx.lineTo(x + tx * tailLen - px * size * 0.9, y + ty * tailLen - py * size * 0.9);
  ctx.closePath();
  ctx.globalAlpha = alpha * 0.55;
  ctx.fill();
  ctx.globalAlpha = alpha;
  // coma + nucleus
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 2.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, size * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, size * 0.7), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Smoothstep easing for glide + shuttle motion (no velocity snaps). */
function smooth01(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export default function BlinkComparator({
  frames, band, onBandChange, title, mode, onModeChange, epochIdx, onEpochChange,
  showMarkers, onToggleMarkers, fovArcmin = 10, onSample, center, knownNames, bandPngs, onStats,
}: {
  frames: BlinkFrame[]; band: number; onBandChange: (b: number) => void; title: string;
  mode: CompareMode; onModeChange: (m: CompareMode) => void;
  epochIdx: number; onEpochChange: (i: number) => void;
  showMarkers: boolean; onToggleMarkers?: () => void; fovArcmin?: number;
  onSample?: (args: { x: number; y: number; values: number[] }) => void;
  center?: { ra: number; dec: number };
  /** Known-object names at field center (SkyBoT) for the chart overlay. */
  knownNames?: string[];
  /** Newest-epoch PNG per detector (1-6) for true false-color composites. */
  bandPngs?: Record<number, string | null>;
  onStats?: (s: { movers: number; variables: number; ready: boolean } | null) => void;
}) {
  const n = frames.length;
  const idx = Math.min(epochIdx, n - 1);
  const prevIdx = (idx - 1 + n) % n;
  const [playing, setPlaying] = useState(false);  const [speed, setSpeed] = useState(550);
  const [palette, setPalette] = useState(false);
  const [palQ, setPalQ] = useState('');
  const [palActive, setPalActive] = useState(0);
  const [stretch, setStretch] = useState<Stretch>('asinh');
  const [cmap, setCmap] = useState<Colormap>(() => (useAppStore.getState().colorblind ? 'cividis' : 'grayscale'));
  const [invert, setInvert] = useState(false);
  const [vmin, setVmin] = useState(0.05);
  const [vmax, setVmax] = useState(0.98);
  const [diffScale, setDiffScale] = useState(3);
  const [swipe, setSwipe] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | undefined>(undefined);
  // view mirror: zoom never drops below cover, pan never leaves the frame
  const vpRef = useRef({ zoom: 1, x: 0, y: 0 });
  const clampView = (zoom: number, px: number, py: number) => {
    const z = Math.min(6, Math.max(1, zoom));
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || !img.naturalWidth) return { z, x: 0, y: 0 };
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return { z, x: 0, y: 0 };
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * z;
    const mx = Math.max(0, (img.naturalWidth * scale - w) / 2);
    const my = Math.max(0, (img.naturalHeight * scale - h) / 2);
    return { z, x: Math.min(mx, Math.max(-mx, px)), y: Math.min(my, Math.max(-my, py)) };
  };
  const applyView = (zoom: number, px: number, py: number) => {
    const c = clampView(zoom, px, py);
    vpRef.current = { zoom: c.z, x: c.x, y: c.y };
    setZoom(c.z);
    setPan({ x: c.x, y: c.y });
  };
  const [channel, setChannel] = useState<number>(() => {
    const ch = CHANNELS.filter((c) => c.detector === band);
    return ch[Math.floor(ch.length / 2)]?.idx ?? 0;
  });
  const [rgb, setRgb] = useState<[number, number, number]>([16, 33, 50]);
  // Motion color is an exclusive view mode, not an overlay toggle.
  const showRgb = mode === 'color';
  const [falseColor, setFalseColor] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const [loadedBand, setLoadedBand] = useState<Record<string, HTMLImageElement>>({});
  const [recording, setRecording] = useState(false);
  const [probe, setProbe] = useState<{ sx: number; sy: number; lum: number; ra: number; dec: number } | null>(null);
  const [specVals, setSpecVals] = useState<number[] | null>(null);
  const [sideHover, setSideHover] = useState<{ x: number; y: number; a: number; b: number } | null>(null);
  const [measureChip, setMeasureChip] = useState<{ x: number; y: number; lum: number; label: string } | null>(null);
  // keyboard crosshair state lives with the other hooks (never below the
  // early returns): arrows move it, Enter measures at its position.
  const [cross, setCross] = useState({ x: 0.5, y: 0.5 });

  // Reset per-frame measurement when the frame set actually changes. Done
  // during render (not in an effect): `frames` gets a fresh identity on every
  // parent render, so an effect-based reset would cascade far more often than
  // needed. Re-renders only when the PNG list contents actually change.
  const [framesSig, setFramesSig] = useState<string | null>(null);
  const nextSig = frames.map((f) => f.png ?? '').join('|');
  if (framesSig !== nextSig) {
    setFramesSig(nextSig);
    setSpecVals(null);
    setMeasureChip(null);
  }

  const mainRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [sizeTick, setSizeTick] = useState(0);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const diffStatRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null);
  // multi-touch pinch zoom: live pointer positions + touchdown baseline
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  // Orbital `suppressClick` pattern: a pointer travel past the drag
  // hysteresis is a pan, never a tap — the trailing click must not sample.
  const suppressClick = useRef(false);
  // Scratch-canvas pool: cover-fit staging reuses canvases across renders
  // (zero per-frame allocation) instead of `document.createElement` churn.
  const scratchPool = useRef<HTMLCanvasElement[]>([]);
  const sampleScratch = useRef<HTMLCanvasElement | null>(null);
  const getScratch = useCallback((slot: number, w: number, h: number): HTMLCanvasElement => {
    let c = scratchPool.current[slot];
    if (!c) { c = document.createElement('canvas'); scratchPool.current[slot] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }, []);
  const panRaf = useRef(0);
  const panPending = useRef<{ x: number; y: number } | null>(null);
  const probeSrc = useRef<{ img: HTMLImageElement; w: number; h: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // staged preloading that heals itself (the project norm: preview first,
  // refine after). A pump reconciles desired-vs-actual on EVERY render: any
  // frame URL that is neither loaded, failed, nor in flight gets started —
  // current pair first, one new start per pump, ~350ms apart so IBE renders
  // don't thunder the archive. Timer chains, generation counters, and
  // started-sets all proved fragile across autoplay re-renders, StrictMode
  // remounts, and HMR swaps (frames stranded at 1/5 with zero errors); this
  // converges under all of them because it never assumes past scheduling
  // happened. Failed loads auto-retry with backoff (3 attempts); exhausted
  // URLs land in `failed` and render a Retry affordance.
  const MAX_FRAME_ATTEMPTS = 3;
  const [failed, setFailed] = useState<Record<string, true>>({});
  const inflight = useRef(new Set<string>());
  const lastStart = useRef(0);
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Refs survive hot-module swaps positionally: an older loader revision's
  // ref objects can land in these slots (stale in-flight marks, a string
  // timestamp). Reset + validate on mount so no past revision can wedge the
  // pump. Declared before the pump so it runs first. (A duplicate start from
  // a dropped mark is harmless: loaded/failed guards dedupe on settle.)
  useEffect(() => {
    inflight.current = new Set<string>();
    if (typeof lastStart.current !== 'number') lastStart.current = 0;
    if (!Array.isArray(retryTimers.current)) retryTimers.current = [];
  }, []);
  useEffect(() => () => {
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current = [];
  }, []);
  const loadFrame = useCallback((u: string, attempt = 1) => {
    if (inflight.current.has(u)) return;
    inflight.current.add(u);
    const attemptLoad = (a: number): void => {
      void loadImage(u).then((img) => {
        inflight.current.delete(u);
        // bounded: decoded frames cap at 24 URLs (re-decode from IDB on
        // revisit — cheap). Unbounded growth was flagged in audit F11.
        setLoaded((m) => {
          if (m[u]) return m;
          const next = { ...m, [u]: img };
          const keys = Object.keys(next);
          for (const k of keys.slice(0, Math.max(0, keys.length - 24))) delete next[k];
          return next;
        });
        setFailed((m) => {
          if (!(u in m)) return m;
          const next = { ...m };
          delete next[u];
          return next;
        });
      }).catch(() => {
        if (a < MAX_FRAME_ATTEMPTS) {
          const t = setTimeout(() => attemptLoad(a + 1), a * 1000);
          retryTimers.current.push(t);
        } else {
          inflight.current.delete(u);
          setFailed((m) => (m[u] ? m : { ...m, [u]: true }));
          console.warn(`[blink] frame failed to load after ${a} attempts: ${u}`);
        }
      });
    };
    attemptLoad(attempt);
  }, []);
  const retryUrl = useCallback((u: string) => {
    setFailed((m) => {
      if (!(u in m)) return m;
      const next = { ...m };
      delete next[u];
      return next;
    });
    loadFrame(u, 1);
  }, [loadFrame]);
  // pump on every render + a heartbeat for settled pages (autoplay ticks
  // re-render constantly; a paused static page relies on the interval).
  // Local showcase PNGs all start at once (same-origin, instant); live
  // /api/frame.png renders stay throttled so IBE isn't thundered.
  // Interval is created ONCE (audit: dep-less effect rebuilt it every render);
  // mutable inputs ride refs so the schedule never churns.
  const pumpRefs = useRef({ frames, idx, n, loaded, failed, loadFrame });
  pumpRefs.current = { frames, idx, n, loaded, failed, loadFrame };
  useEffect(() => {
    const pump = () => {
      if (document.hidden) return; // visibility pause: heartbeat skips while hidden
      const { frames: fr, idx: ii, n: nn, loaded: ld, failed: fl, loadFrame: lf } = pumpRefs.current;
      const urls = [...new Set(fr.map((f) => f.png).filter((u): u is string => !!u))];
      const ordered = [fr[ii]?.png, nn ? fr[(ii - 1 + nn) % nn]?.png : undefined, ...urls];
      const now = Date.now();
      let remoteStarted = false;
      for (const u of ordered) {
        if (!u || ld[u] || fl[u] || inflight.current.has(u)) continue;
        if (u.includes('/api/')) {
          if (remoteStarted || now - lastStart.current < 350) continue;
          remoteStarted = true;
          lastStart.current = now;
        }
        lf(u, 1);
      }
    };
    pump();
    const t = setInterval(pump, 350);
    return () => clearInterval(t);
  }, []);

  // preload band PNGs for true false-color (one retry; still silent-graceful:
  // false color simply stays disabled until they arrive)
  useEffect(() => {
    let alive = true;
    const urls = [...new Set(Object.values(bandPngs ?? {}).filter((u): u is string => !!u))];
    const load = (u: string, attempt = 1): Promise<{ u: string; img: HTMLImageElement } | null> =>
      loadImage(u).then((img) => ({ u, img })).catch(() => {
        if (attempt < 2) return load(u, attempt + 1);
        console.warn(`[blink] band image failed to load: ${u}`);
        return null;
      });
    void Promise.all(urls.map((u) => load(u))).then((arr) => {
      if (!alive) return;
      const map: Record<string, HTMLImageElement> = {};
      for (const e of arr) if (e) map[e.u] = e.img;
      setLoadedBand(map);
    });
    return () => { alive = false; };
  }, [bandPngs]);

  // autoplay rides only decoded frames: stepping onto a pending/failed frame
  // would flash "loading" or "cutout pending" mid-blink. Manual transport
  // (steps, scrub, filmstrip) keeps full agency and shows each frame's state.
  const availIdx = useMemo(
    () => frames.map((f, i) => (f.png && loaded[f.png] ? i : -1)).filter((i) => i >= 0),
    [frames, loaded],
  );
  // replay rides pairs with measured motion only: tracked candidates per
  // epoch pair (prev → cur), with measured endpoint brightness and stable
  // cross-pair numbers. Recomputed as frames decode; cheap (96px
  // downsamples), cached by the memo. Keyed on the PNG URL list — the
  // frames array itself is a fresh literal every parent render, which must
  // NOT invalidate the cache (it would cascade: candidates → onStats →
  // parent setState → render → infinite loop).
  const pairFramesSig = frames.map((f) => f.png ?? '').join('|');
  const pairCands = useMemo(() => {
    const out: TrackedCandidate[][] = [];
    for (let i = 0; i < n; i++) {
      const a = frames[(i - 1 + n) % n];
      const b = frames[i];
      const ia = a.png ? loaded[a.png] : undefined;
      const ib = b.png ? loaded[b.png] : undefined;
      if (!ia || !ib) { out.push([]); continue; }
      try {
        const ga = sampleGray(ia);
        const gb = sampleGray(ib);
        if (!ga || !gb) { out.push([]); continue; }
        out.push(detectMotion(ga, gb).map((c) => ({
          ...c, n: 0, ba: sampleGrayAt(ga, c.x, c.y), bb: sampleGrayAt(gb, c.x, c.y),
        })));
      } catch { out.push([]); /* ignore undecodable pairs */ }
    }
    // chain numbers across pairs so one object keeps its identity (and its
    // label) while stepping through epochs
    let free = 1;
    const numbered: TrackedCandidate[][] = [];
    for (let i = 0; i < n; i++) {
      const prev = numbered[(i - 1 + n) % n] ?? [];
      const { ids, next } = assignTrackIds(prev, out[i], free);
      free = next;
      numbered.push(out[i].map((c, k) => ({ ...c, n: ids[k] })));
    }
    return numbered;
  }, [pairFramesSig, loaded, n]);
  const pairMotion = useMemo(() => pairCands.map((l) => l.length > 0), [pairCands]);
  const motionIdx = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (pairMotion[i]) out.push(i);
    return out;
  }, [pairMotion, n]);
  // full measured paths per object (initial place → last place), for the
  // replay flight lines. Deterministic: rebuilt identically while caller
  // passes the same numbered pairs.
  const tracks: Track[] = useMemo(() => buildTracks(pairCands), [pairCands]);
  // live mirrors for callbacks (transport + autoplay stay correct mid-flight)
  const pairMotionRef = useRef<boolean[]>([]);
  pairMotionRef.current = pairMotion;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const phaseRef = useRef(0);
  // replay glide: previous-pair positions by track number for pair-change easing
  const glideRef = useRef<{ map: Map<number, { x: number; y: number }>; t0: number } | null>(null);
  const glideCands = useRef<TrackedCandidate[] | null>(null);
  // replay motion trails: recent traveler positions per track number
  const trailRef = useRef(new Map<number, Array<{ x: number; y: number }>>());
  // autoplay
  useEffect(() => {
    if (!playing || availIdx.length < 2) return;
    timer.current = setInterval(() => {
      // replay rides motion pairs only — blank pairs never take the stage
      if (mode === 'replay' && motionIdx.length) {
        const pos = motionIdx.indexOf(idx);
        onEpochChange(pos >= 0 ? motionIdx[(pos + 1) % motionIdx.length] : motionIdx[0]);
        return;
      }
      const pos = availIdx.indexOf(idx);
      onEpochChange(pos >= 0 ? availIdx[(pos + 1) % availIdx.length] : availIdx[0]);
    }, speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, availIdx, idx, onEpochChange, mode, motionIdx]);

  // visibility pause: a hidden tab never advances the blink
  useEffect(() => {
    const onVis = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // reduced motion: never autoplay
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  // autoplay on arrival (loops forever until the user steps in)
  useEffect(() => {
    if (n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(true);
  }, [n]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    // replay transport hops between motion pairs; blanks are never shown
    if (mode === 'replay' && d !== 0 && motionIdx.length) {
      for (let k = 1; k <= n; k++) {
        const j = (((idx + d * k) % n) + n) % n;
        if (motionIdx.includes(j)) { onEpochChange(j); return; }
      }
    }
    onEpochChange((idx + d + n) % n);
  }, [idx, n, onEpochChange, mode, motionIdx]);

  const cur = frames[idx];
  const prev = frames[prevIdx];
  const curLbl = cur?.label ?? '—';
  const downloadPNG = useCallback(() => {
    const canvas = mode === 'side' ? rightRef.current : mainRef.current;
    if (!canvas || curLbl === '—') return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `drishti-${curLbl.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
  }, [mode, curLbl]);

  const copyLink = useCallback(() => {
    const url = window.location.href;
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch { /* clipboard unavailable — link stays in the address bar */ }
    };
    try {
      const pending = navigator.clipboard?.writeText(url);
      if (pending && typeof pending.catch === 'function') void pending.catch(legacyCopy);
      else legacyCopy();
    } catch { legacyCopy(); }
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
        else setMeasureChip(null);
        return;
      }
      if (mod || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      // Roving scope: the timeline scrub keeps transport keys (arrows step,
      // Space toggles) with preventDefault so the native slider does not
      // double-step beneath us. Every other field keeps its native keys.
      const isScrub = el instanceof HTMLInputElement
        && (el.classList.contains('scrub') || el.getAttribute('aria-label') === 'Timeline scrub');
      if (!isScrub && (['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(tag)
        || el.getAttribute('role') === 'combobox' || el.isContentEditable)) return;
      // canvas owns arrows/Enter for the crosshair (audit: one press must not
      // both move the crosshair and step the epoch); Space still toggles play
      if (el.tagName === 'CANVAS' && e.key !== ' ') return;
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
      applyView(vpRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.09), vpRef.current.x, vpRef.current.y);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(stage);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  const curImg = cur?.png ? loaded[cur.png] : undefined;
  imgRef.current = curImg;
  const prevImg = prev?.png ? loaded[prev.png] : undefined;
  const totalFrames = frames.filter((f) => f.png).length;
  const doneFrames = frames.filter((f) => f.png && loaded[f.png]).length;
  // real motion candidates from the actual pixels (recomputed when frames arrive)
  const candidates: TrackedCandidate[] = useMemo(
    () => pairCands[Math.min(idx, Math.max(0, n - 1))] ?? [],
    [pairCands, idx],
  );
  // replay star layer: Gaia points around the field center (cached
  // server-side 30d). Empty without the live API — the chart still draws
  // detections, with an on-canvas note. Primitive deps: center is an inline
  // literal upstream, so object identity would refetch every render.
  const [chartStars, setChartStars] = useState<Array<{ ra: number; dec: number; g_mag: number | null }>>([]);
  useEffect(() => {
    if (mode !== 'replay' || !center || !API_BASE) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChartStars((prev) => (prev.length ? [] : prev));
      return;
    }
    let alive = true;
    const fov = Math.max(0.3, fovArcmin / 60 + 0.2);
    void fetch(`${API_BASE}/api/stars?ra=${center.ra.toFixed(2)}&dec=${center.dec.toFixed(2)}&fov_deg=${fov.toFixed(1)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && Array.isArray(j.stars)) setChartStars(j.stars); })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, center?.ra, center?.dec, fovArcmin]);
  // detection summary for the data rail (parent-owned state, effect boundary)
  useEffect(() => {
    if (!onStats) return;
    if (!curImg || !prevImg) {
      onStats(null);
      return;
    }
    const movers = candidates.filter((c) => c.kind === 'mover').length;
    onStats({ movers, variables: candidates.length - movers, ready: true });
  }, [candidates, curImg, prevImg, onStats]);
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

  // replay entry: land on a motion pair when entering the mode (once per
  // entry while pairs are still decoding; scrubbed blank pairs are left
  // alone with an honest on-canvas note).
  const replayEntered = useRef(false);
  useEffect(() => {
    if (mode !== 'replay') { replayEntered.current = false; return; }
    if (replayEntered.current) return;
    const pm = pairMotionRef.current;
    if (!pm.some(Boolean)) return; // nothing measured yet; retry as pairs decode
    replayEntered.current = true;
    const j = pm.findIndex(Boolean);
    if (j >= 0 && j !== idx) onEpochChange(j);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pairMotion]);

  // Replay: full-view simulated motion. Self-contained rAF loop over refs —
  // no react churn per frame. Detected movers fly their measured dipole
  // vectors (ping-pong), variables pulse, Gaia stars hold the field.
  useEffect(() => {
    if (mode !== 'replay') return;
    const canvas = mainRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let lastW = 0;
    let lastH = 0;
    let last = performance.now();

    const draw = (_nowMs = 0, staticFrame = false) => {
      const w = host.clientWidth;
      const h = host.clientHeight || host.clientWidth;
      if (!w || !h) return;
      if (w !== lastW || h !== lastH) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        lastW = w; lastH = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // deep-field backdrop with vignette
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.72);
      bg.addColorStop(0, '#070a18');
      bg.addColorStop(1, '#02030a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // faint graticule
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 1;
      for (const f of [1 / 3, 2 / 3]) {
        ctx.beginPath(); ctx.moveTo(f * w, 0); ctx.lineTo(f * w, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, f * h); ctx.lineTo(w, f * h); ctx.stroke();
      }
      // Gaia starfield through the linear field mapping (F across the width)
      if (center && chartStars.length) {
        const F = Math.max(1e-6, fovArcmin / 60);
        const cosd = Math.cos((center.dec * Math.PI) / 180);
        for (const s of chartStars) {
          const dx = (-(s.ra - center.ra) * cosd) / F;
          const dy = (s.dec - center.dec) / F;
          if (Math.abs(dx) > 0.55 || Math.abs(dy) > 0.55) continue;
          const sx = w / 2 + dx * w;
          const sy = h / 2 - dy * h;
          const g = s.g_mag ?? 14;
          if (g < 11) {
            drawStarSprite(ctx, sx, sy, Math.min(2.2, Math.max(1, 2.4 - (g - 6) * 0.2)), '#e8efff', 'rgba(200,220,255,.7)');
          } else {
            const r = Math.min(2.4, Math.max(0.6, 2.6 - (g - 6) * 0.24));
            ctx.fillStyle = 'rgba(220,228,245,.66)';
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // known object at field center
      if (knownNames?.length) {
        ctx.strokeStyle = 'rgba(95,207,154,.85)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#5fcf9a';
        ctx.font = '600 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(knownNames[0].slice(0, 30), w / 2, h / 2 - 28);
        ctx.textAlign = 'left';
      }
      const pm = pairMotionRef.current;
      const motionCount = pm.filter(Boolean).length;
      const allDecoded = totalFrames > 0 && doneFrames >= totalFrames;
      if (!candidates.length) {
        ctx.fillStyle = '#8a90ab';
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          motionCount > 0
            ? 'NO MOTION IN THIS PAIR — STEP TO SKIP'
            : allDecoded ? 'NO MOTION IN ANY PAIR — TRY BLINK OR DIFF' : 'SCANNING PAIRS FOR MOTION…',
          w / 2, h / 2,
        );
        ctx.textAlign = 'left';
      } else {
        // loop phase from accumulated play time: pause freezes, rate bends tempo.
        // eased shuttle (smoothstep): travelers glide A→B with no velocity snap.
        const T = staticFrame ? -1 : phaseRef.current;
        const period = Math.min(4, Math.max(1.2, speed / 1000 * 2.5));
        const ph = T < 0 ? 0.5 : (((T % period) + period) % period) / period;
        const tri = smooth01(ph < 0.5 ? ph * 2 : 2 - ph * 2);
        // flight across pair changes: the same track number eases from its
        // old spot to the new one along its measured path (~1.4 s), so jumps
        // read as travel. Patrol (ping-pong around the pair dipole) resumes
        // on arrival; labels ride the traveler.
        if (glideCands.current !== candidates) {
          const prev = new Map<number, { x: number; y: number }>();
          for (const p of glideCands.current ?? []) prev.set(p.n, { x: p.x, y: p.y });
          glideRef.current = { map: prev, t0: performance.now() };
          glideCands.current = candidates;
          // prune trails of vanished tracks (bounded memory, no stale streaks)
          for (const k of [...trailRef.current.keys()]) {
            if (!candidates.some((c) => c.n === k)) trailRef.current.delete(k);
          }
        }
        const gk = smooth01((performance.now() - (glideRef.current?.t0 ?? 0)) / 1400);
        // full measured paths: every track's initial → last place, faint
        ctx.lineWidth = 1.2;
        for (const t of tracks) {
          if (t.points.length < 2) continue;
          ctx.strokeStyle = t.kind === 'mover' ? 'rgba(240,187,82,.22)' : 'rgba(90,169,230,.20)';
          ctx.beginPath();
          t.points.forEach((p, k) => {
            const px = p.x * w;
            const py = p.y * h;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
        const labels: Array<{ x: number; y: number; text: string; color: string }> = [];
        candidates.forEach((c, i) => {
          const gp = glideRef.current?.map.get(c.n);
          const fx = gp ? gp.x + (c.x - gp.x) * gk : c.x;
          const fy = gp ? gp.y + (c.y - gp.y) * gk : c.y;
          const isMover = c.kind === 'mover';
          const col = isMover ? '#f0bb52' : '#5aa9e6';
          if (isMover) {
            const ax = fx * w - (c.dx * w) / 2;
            const ay = fy * h - (c.dy * h) / 2;
            const bx = fx * w + (c.dx * w) / 2;
            const by = fy * h + (c.dy * h) / 2;
            // faint measured-vector rail
            ctx.strokeStyle = 'rgba(240,187,82,.28)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(ax - (bx - ax) * 0.2, ay - (by - ay) * 0.2);
            ctx.lineTo(bx + (bx - ax) * 0.2, by + (by - ay) * 0.2);
            ctx.stroke();
            // comet flying the dipole: eased patrol around the flight base
            const tx = ax + (bx - ax) * tri;
            const ty = ay + (by - ay) * tri;
            const ang = Math.atan2(by - ay, bx - ax);
            const size = 2.6 + Math.min(2.4, c.sigma / 40);
            drawComet(ctx, tx, ty, ang, size, 'rgba(240,187,82,.85)');
            // fading motion trail behind the traveler
            const trail = trailRef.current.get(c.n) ?? [];
            trail.push({ x: tx, y: ty });
            if (trail.length > 22) trail.shift();
            trailRef.current.set(c.n, trail);
            for (let s = 1; s < trail.length; s++) {
              ctx.strokeStyle = `rgba(240,187,82,${(0.35 * s / trail.length).toFixed(3)})`;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(trail[s - 1].x, trail[s - 1].y);
              ctx.lineTo(trail[s].x, trail[s].y);
              ctx.stroke();
            }
            // arrowhead at the measured destination
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx - 9 * Math.cos(ang - 0.42), by - 9 * Math.sin(ang - 0.42));
            ctx.moveTo(bx, by);
            ctx.lineTo(bx - 9 * Math.cos(ang + 0.42), by - 9 * Math.sin(ang + 0.42));
            ctx.stroke();
            labels.push({ x: tx, y: ty - 18, text: `M${c.n || i + 1} ${c.sigma.toFixed(0)}σ`, color: col });
          } else {
            const X = fx * w;
            const Y = fy * h;
            // variable star: measured brightness drives the pulse (ba→bb)
            const bv = Math.max(0.12, Math.min(1, c.ba + (c.bb - c.ba) * tri));
            drawStarSprite(ctx, X, Y, 1.6 + bv * 1.8, '#dfe9ff', 'rgba(90,169,230,.8)', 0.35 + 0.65 * bv);
            labels.push({ x: X, y: Y - 16, text: `V${c.n || i + 1} ${c.sigma.toFixed(0)}σ`, color: col });
          }
        });
        // de-collided labels: single vertical pass, 15px minimum pitch
        labels.sort((a, b) => a.y - b.y);
        for (let i = 1; i < labels.length; i++) {
          if (labels[i].y < labels[i - 1].y + 15) labels[i].y = labels[i - 1].y + 15;
        }
        ctx.font = '600 11px ui-monospace, monospace';
        for (const l of labels) {
          const lx = Math.min(w - 8, Math.max(8, l.x));
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(2,3,10,.9)';
          ctx.strokeText(l.text, lx, Math.min(h - 30, Math.max(14, l.y)));
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, lx, Math.min(h - 30, Math.max(14, l.y)));
          ctx.textAlign = 'left';
        }
      }
      // captions: pair progress + honesty tag (y=40 clears the DOM viewer tags)
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(232,195,74,.9)';
      ctx.textAlign = 'center';
      ctx.fillText(`PAIR ${idx + 1}/${n} · ${motionCount} WITH MOTION`, w / 2, 40);
      ctx.fillStyle = 'rgba(138,144,171,.85)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('SIMULATED FROM ≥5σ DETECTIONS — NOT SKY PIXELS', w / 2, h - 12);
      ctx.textAlign = 'left';
    };

    if (reduce) {
      draw(performance.now(), true);
      return;
    }
    let raf = requestAnimationFrame(function loop(t) {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (playingRef.current) phaseRef.current += dt;
      draw();
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pairMotion, candidates, tracks, chartStars, knownNames, center, fovArcmin, speed, idx, n, totalFrames, doneFrames]);
  // render main canvas + histogram + diff stats (DOM-direct, no react state)
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    // replay owns its canvas via a dedicated rAF loop — stay out so pixels
    // (and the rail histogram below) never mix capture with simulation.
    if (mode === 'replay') return;
    const host = canvas.parentElement;
    if (!host) return;
    const w = host.clientWidth;
    const h = host.clientHeight || host.clientWidth;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);

    const mk = (img: HTMLImageElement, slot: number) => {
      const c = getScratch(slot, Math.round(w), Math.round(h));
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (cctx) drawCover(cctx, img, w, h, pan, zoom);
      return cctx?.getImageData(0, 0, c.width, c.height);
    };

    if (mode === 'side') return;
    let diffMode = false;
    if (falseColor) {
      // TRUE false-color: the three chosen channels' detector images → R/G/B
      const detOf = (ch: number) => CHANNELS[ch]?.detector ?? 3;
      const chImgs = ([rgb[0], rgb[1], rgb[2]] as number[]).map((ch) => {
        const url = bandPngs?.[detOf(ch)];
        return url ? loadedBand[url] : undefined;
      });
      if (chImgs[0] && chImgs[1] && chImgs[2]) {
        const chans = (chImgs as HTMLImageElement[]).map((img, ci) => {
          const c = getScratch(ci, Math.round(w), Math.round(h));
          const cctx = c.getContext('2d', { willReadFrequently: true });
          if (cctx) drawCover(cctx, img, w, h, pan, zoom);
          return cctx?.getImageData(0, 0, c.width, c.height);
        });
        if (chans[0] && chans[1] && chans[2]) {
          const out = ctx.createImageData(Math.round(w), Math.round(h));
          const span = Math.max(1e-6, vmax - vmin);
          const norm = (lum: number) => {
            const t = Math.min(1, Math.max(0, (lum - vmin) / span));
            return applyStretch(t, stretch);
          };
          const lumOf = (d: ImageData, i: number) =>
            (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255;
          const [R, G, B] = chans as ImageData[];
          for (let i = 0; i < out.data.length; i += 4) {
            out.data[i] = Math.round(norm(lumOf(R, i)) * 255);
            out.data[i + 1] = Math.round(norm(lumOf(G, i)) * 255);
            out.data[i + 2] = Math.round(norm(lumOf(B, i)) * 255);
            out.data[i + 3] = 255;
          }
          // putImageData ignores the DPR transform: composite through scratch
          // so processed modes fill the whole stage on hidpi phones too.
          const comp = getScratch(3, Math.round(w), Math.round(h));
          const cctx = comp.getContext('2d');
          if (cctx) {
            cctx.putImageData(out, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(comp, 0, 0, w, h);
          } else ctx.putImageData(out, 0, 0);
        }
      } else {
        ctx.fillStyle = '#aab0c8';
        ctx.font = '13px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Band images still indexing — false color arrives with them.', w / 2, h / 2);
      }
    } else if (showRgb && curImg && prevImg) {
      const A = mk(prevImg, 0);
      const B = mk(curImg, 1);
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
        // putImageData ignores the DPR transform: composite through scratch
        // so processed modes fill the whole stage on hidpi phones too.
        const comp = getScratch(3, Math.round(w), Math.round(h));
        const cctx = comp.getContext('2d');
        if (cctx) {
          cctx.putImageData(out, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(comp, 0, 0, w, h);
        } else ctx.putImageData(out, 0, 0);
      }
    } else if (mode === 'diff' && curImg && prevImg) {
      diffMode = true;
      const A = mk(prevImg, 0);
      const B = mk(curImg, 1);
      if (A && B) {
        const out = ctx.createImageData(Math.round(w), Math.round(h));
        for (let i = 0; i < out.data.length; i += 4) {
          const la = (A.data[i] * 0.299 + A.data[i + 1] * 0.587 + A.data[i + 2] * 0.114) / 255;
          const lb = (B.data[i] * 0.299 + B.data[i + 1] * 0.587 + B.data[i + 2] * 0.114) / 255;
          const g = Math.round(((lb - la) * 0.5 + 0.5) * 255);
          out.data[i] = g; out.data[i + 1] = g; out.data[i + 2] = g; out.data[i + 3] = 255;
        }
        // putImageData ignores the DPR transform: composite through scratch
        // so processed modes fill the whole stage on hidpi phones too.
        const comp = getScratch(3, Math.round(w), Math.round(h));
        const cctx = comp.getContext('2d');
        if (cctx) {
          cctx.putImageData(out, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(comp, 0, 0, w, h);
        } else ctx.putImageData(out, 0, 0);
        stylize(canvas, stretch, vmin, vmax, invert, cmap, true, diffScale);
      }
    } else if (mode === 'swipe' && curImg && prevImg) {
      const off = getScratch(3, canvas.width, canvas.height);
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
    } else if (cur?.png) {
      // frame exists but is still decoding: hold the last loaded frame dimmed
      // with a small loading tag (never flash the pending message for real data).
      // Exhausted loads (see `failed`) name the failure instead of spinning forever.
      const isFailed = !!failed[cur.png];
      const hold = prevImg ?? Object.values(loaded)[0];
      if (hold) {
        ctx.globalAlpha = 0.45;
        drawCover(ctx, hold, w, h, pan, zoom);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = isFailed ? '#e8c34a' : 'rgba(238,240,248,.85)';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isFailed ? 'frame failed to load — use Retry' : 'loading frame…', w / 2, h - 30);
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
        ctx.fillText(`${isMover ? 'M' : 'V'}${c.n || i + 1} ${c.sigma.toFixed(0)}σ`, X + 11, Y - 9);
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
  }, [curImg, prevImg, mode, stretch, vmin, vmax, invert, cmap, diffScale, swipe, pan, zoom, showMarkers, showRgb, falseColor, loadedBand, rgb, bandPngs, fovArcmin, candidates, sizeTick, failed, loaded, chartStars, knownNames, center, getScratch, cur?.png]);

  // side-by-side render (synchronized pan/zoom + linked cursor)
  useEffect(() => {
    if (mode !== 'side') return;
    const panes: Array<{ ref: typeof leftRef; img?: HTMLImageElement }> = [
      { ref: leftRef, img: prevImg },
      { ref: rightRef, img: curImg },
    ];
    for (const { ref, img } of panes) {
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
      if (sideHover) {
        const hx = sideHover.x * w;
        const hy = sideHover.y * h;
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx - 10, hy); ctx.lineTo(hx + 10, hy);
        ctx.moveTo(hx, hy - 10); ctx.lineTo(hx, hy + 10);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(124,131,253,.9)';
        ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }, [mode, prevImg, curImg, pan, zoom, stretch, vmin, vmax, invert, cmap, diffScale, sideHover]);

  const sampleAt = (img: HTMLImageElement | undefined, x: number, y: number): number => {
    if (!img) return 0;
    try {
      let c = sampleScratch.current;
      if (!c) { c = document.createElement('canvas'); sampleScratch.current = c; }
      c.width = 32; c.height = 32;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (!cctx) return 0;
      cctx.drawImage(img, 0, 0, 32, 32);
      const d = cctx.getImageData(
        Math.max(0, Math.min(31, Math.floor(x * 32))),
        Math.max(0, Math.min(31, Math.floor(y * 32))), 1, 1).data;
      return Math.round((d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114));
    } catch {
      return 0;
    }
  };

  const onSideMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setSideHover({ x, y, a: sampleAt(prevImg, x, y), b: sampleAt(curImg, x, y) });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // second finger down: park the pan, pinch takes over
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), zoom: vpRef.current.zoom,
      };
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, pan: { x: vpRef.current.x, y: vpRef.current.y }, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.current.size >= 2) {
      // pinch zoom: ratio against the two-finger touchdown distance
      const pts = [...pointers.current.values()];
      const dist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      if (pinch.current) {
        const ratio = dist / Math.max(20, pinch.current.dist);
        applyView(pinch.current.zoom * ratio, vpRef.current.x, vpRef.current.y);
        suppressClick.current = true; // pinch never counts as a tap
      } else {
        pinch.current = { dist, zoom };
      }
      return;
    }
    if (mode === 'swipe' && e.pointerType === 'mouse' && e.buttons === 0) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSwipe(Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)));
    } else if (mode === 'swipe' && e.pointerType !== 'mouse' && e.isPrimary !== false) {
      // touch/pen path: the curtain follows the finger while swiping
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSwipe(Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)));
      return;
    }
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      // unified 5px hysteresis with the Orbital surfaces: inside it, hold
      // still (hover probe keeps working); past it, this is a pan and the
      // trailing click must not sample.
      if (Math.hypot(dx, dy) > 5) {
        drag.current.moved = true;
        suppressClick.current = true;
      } else return;
      // rAF-throttle: full-res restyle runs at most once per frame while dragging
      panPending.current = { x: drag.current.pan.x + dx, y: drag.current.pan.y + dy };
      if (!panRaf.current) {
        panRaf.current = requestAnimationFrame(() => {
          panRaf.current = 0;
          if (panPending.current) applyView(vpRef.current.zoom, panPending.current.x, panPending.current.y);
        });
      }
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
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // back to one finger: re-anchor the pan on the remaining touch
      const [, pt] = [...pointers.current.entries()][0];
      drag.current = { x: pt.x, y: pt.y, pan: { ...pan }, moved: true };
      return;
    }
    drag.current = null;
  };
  const onClickSample = (e: React.MouseEvent) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (drag.current?.moved) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    sampleSpot(x, y);
  };
  const onCanvasKey = (e: React.KeyboardEvent) => {    const step = 1 / 32;
    let { x, y } = cross;
    if (e.key === 'ArrowLeft') x = Math.max(0, x - step);
    else if (e.key === 'ArrowRight') x = Math.min(1, x + step);
    else if (e.key === 'ArrowUp') y = Math.max(0, y - step);
    else if (e.key === 'ArrowDown') y = Math.min(1, y + step);
    else if (e.key === 'Enter') { e.preventDefault(); sampleSpot(cross.x, cross.y); return; }
    else return;
    e.preventDefault();
    setCross({ x, y });
    setMeasureChip({ x, y, lum: 0, label: `crosshair ${Math.round(x * 100)}%, ${Math.round(y * 100)}%` });
  };
  function sampleSpot(x: number, y: number) {
    // chart's right half is schematic and replay is a simulation: taps there
    // don't measure pixels (chart measures on its captured half).
    if (mode === 'replay') return; // simulation taps don't measure pixels
    const values = frames.map((f) => {
      const img = f.png ? loaded[f.png] : undefined;
      if (!img) return 0;
      let c = sampleScratch.current;
      if (!c) { c = document.createElement('canvas'); sampleScratch.current = c; }
      c.width = 32; c.height = 32;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (!cctx) return 0;
      cctx.drawImage(img, 0, 0, 32, 32);
      try {
        const d = cctx.getImageData(Math.floor(x * 31), Math.floor(y * 31), 1, 1).data;
        return Math.round((d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114) * 10) / 10;
      } catch { return 0; }
    });
    if (onSample) onSample({ x, y, values });
    setSpecVals(values);
    setMeasureChip({ x, y, lum: values[idx] ?? 0, label: cur?.label ?? '' });
  };

  /** Publication figure: epoch A | epoch B with labels, scale bar, citation. For posters and the 240-second video. */
  const exportFigure = () => {
    if (!prevImg || !curImg) return;
    const PW = 640;
    const PH = 640;
    const HEAD = 92;
    const FOOT = 64;
    const c = document.createElement('canvas');
    c.width = PW * 2 + 24;
    c.height = HEAD + PH + FOOT;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, c.width, c.height);
    // panels (same cover geometry + processing as the viewer)
    const panels: Array<{ img: HTMLImageElement; x: number; label: string }> = [
      { img: prevImg, x: 0, label: prev?.label ?? 'A' },
      { img: curImg, x: PW + 24, label: cur?.label ?? 'B' },
    ];
    for (const p of panels) {
      const off = document.createElement('canvas');
      off.width = PW; off.height = PH;
      const octx = off.getContext('2d', { willReadFrequently: true });
      if (!octx) continue;
      drawCover(octx, p.img, PW, PH, { x: 0, y: 0 }, 1);
      ctx.drawImage(off, p.x, HEAD, PW, PH);
      ctx.font = '600 15px ui-monospace, monospace';
      const label = p.label.slice(0, 34);
      ctx.fillStyle = 'rgba(5,6,12,.78)';
      ctx.fillRect(p.x + 10, HEAD + 10, ctx.measureText(label).width + 20, 26);
      ctx.fillStyle = '#eef0f8';
      ctx.fillText(label, p.x + 18, HEAD + 28);
    }
    // header + footer
    ctx.fillStyle = '#eef0f8';
    ctx.font = '650 24px system-ui, sans-serif';
    ctx.fillText(title.slice(0, 60), 16, 34);
    ctx.fillStyle = '#aab0c8';
    ctx.font = '15px ui-monospace, monospace';
    ctx.fillText(`SPHEREx · same-band blink · ${bandMeta.label} (${bandMeta.range})`, 16, 60);
    ctx.fillStyle = 'rgba(238,240,248,.9)';
    ctx.fillRect(16, HEAD + PH + 22, 90, 3);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('1′', 110, HEAD + PH + 28);
    ctx.fillStyle = '#8a90ab';
    ctx.fillText('NASA/JPL–Caltech SPHEREx via IRSA (IPAC) · DOI 10.26131/IRSA652 · DRISHTI', 16, HEAD + PH + 48);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'drishti-figure.png';
    a.click();
  };

  const recordWebM = async () => {
    const canvas = mode === 'side' ? rightRef.current : mainRef.current;
    if (!canvas || !canvas.width || n < 2 || recording) return;
    if (typeof MediaRecorder === 'undefined') return;
    if (typeof canvas.captureStream !== 'function') return;
    const mime = 'video/webm';
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function'
        && !MediaRecorder.isTypeSupported(mime)) return;
    } catch { return; }
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(30);
    } catch { return; }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch { return; }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    setRecording(true);
    setPlaying(false);
    try {
      rec.start();
    } catch { setRecording(false); return; }
    for (let i = 0; i < n; i++) {
      onEpochChange(i);
      await new Promise((r) => setTimeout(r, Math.max(250, speed)));
    }
    try {
      rec.stop();
    } catch { setRecording(false); return; }
    const blob = await done;
    setRecording(false);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'drishti-blink.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // external triggers: header Save button + Help palette shortcut
  useEffect(() => {
    const onExport = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind;
      if (kind === 'webm') void recordWebM();
      else if (kind === 'figure') exportFigure();
      else downloadPNG();
    };
    const onPal = () => { setPalActive(0); setPalette(true); };
    window.addEventListener('spectrahunt:export', onExport);
    window.addEventListener('spectrahunt:palette', onPal);
    return () => {
      window.removeEventListener('spectrahunt:export', onExport);
      window.removeEventListener('spectrahunt:palette', onPal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, n]);


  const onModeChangeWrap = (m: CompareMode) => {
    setMeasureChip(null);
    onModeChange(m);
  };
  const setPreset = (p: 'faint' | 'balanced' | 'bright') => {
    if (p === 'faint') { setVmin(0.02); setVmax(0.9); }
    if (p === 'balanced') { setVmin(0.05); setVmax(0.98); }
    if (p === 'bright') { setVmin(0.15); setVmax(1); }
  };
  const activePreset: 'faint' | 'balanced' | 'bright' | null =
    vmin === 0.02 && vmax === 0.9 ? 'faint'
    : vmin === 0.05 && vmax === 0.98 ? 'balanced'
    : vmin === 0.15 && vmax === 1 ? 'bright' : null;
  const scrubPct = n > 1 ? Math.round((idx / (n - 1)) * 100) : 0;

  const setBandAndChannel = (b: number) => {
    onBandChange(b);
    const ch = CHANNELS.filter((c) => c.detector === b);
    setChannel(ch[Math.floor(ch.length / 2)]?.idx ?? 0);
  };
  // Bands with no epochs in this field stay disabled: `bandPngs` carries the
  // newest-epoch PNG per detector, so a missing entry means nothing to blink.
  const hasBandData = (id: number) => {
    if (!bandPngs || Object.keys(bandPngs).length === 0) return true;
    return !!bandPngs[id];
  };

  const modeLabel = mode === 'replay' ? 'Replay · simulated motion' : mode === 'diff' ? 'Difference B−A' : mode === 'swipe' ? 'Swipe A | B' : mode === 'side' ? 'Side-by-side' : mode === 'color' ? 'Motion color' : falseColor ? 'False color' : 'Blink';

  interface Cmd { name: string; hint: string; run: () => void }
  const commands: Cmd[] = [
      { name: playing ? 'Pause blink' : 'Play blink', hint: 'Space', run: () => setPlaying((p) => (n > 1 ? !p : p)) },
      { name: 'Next epoch', hint: '→', run: () => step(1) },
      { name: 'Previous epoch', hint: '←', run: () => step(-1) },
      ...frames.map((f, i) => ({ name: `Go to ${f.label}`, hint: `E${i + 1}`, run: () => { setPlaying(false); onEpochChange(i); } })),
      ...(['blink', 'side', 'swipe', 'diff', 'replay', 'color'] as CompareMode[]).map((m) => ({
        name: `Mode: ${m}`, hint: '', run: () => onModeChangeWrap(m),
      })),
      ...(['linear', 'log', 'sqrt', 'asinh'] as Stretch[]).map((s) => ({
        name: `Stretch: ${s}`, hint: '', run: () => setStretch(s),
      })),
      ...(['cividis', 'grayscale', 'viridis', 'inferno'] as Colormap[]).map((c) => ({
        name: `Colormap: ${c}`, hint: '', run: () => setCmap(c),
      })),
      { name: 'Toggle invert', hint: '', run: () => setInvert((v) => !v) },
      ...BANDS.map((b) => ({ name: `Band ${b.label} (${b.range})`, hint: '', run: () => setBandAndChannel(b.id) })),
      { name: 'Reset view', hint: '', run: () => { vpRef.current = { zoom: 1, x: 0, y: 0 }; setPan({ x: 0, y: 0 }); setZoom(1); } },
      { name: 'Download PNG', hint: '', run: () => downloadPNG() },
      { name: 'Export figure PNG', hint: '', run: () => exportFigure() },
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
          {mode === 'side' && sideHover && (
            <p className="mono side-readout" aria-live="off">
              A {sideHover.a} · B {sideHover.b} · Δ {(sideHover.b - sideHover.a) >= 0 ? '+' : ''}{sideHover.b - sideHover.a}
            </p>
          )}
          <div className="stage-wrap square" ref={stageRef} style={{ touchAction: 'none' }}>
            {mode === 'side' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: '100%', height: '100%' }}>
                <div style={{ position: 'relative' }}>
                  <canvas ref={leftRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} aria-label={`${title} — ${prev?.label}`}
                    onMouseMove={onSideMove} onMouseLeave={() => setSideHover(null)} onClick={onSideMove} />
                  <span className="viewer-tag mono">{prev?.label ?? '—'}</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <canvas ref={rightRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} aria-label={`${title} — ${cur?.label}`}
                    onMouseMove={onSideMove} onMouseLeave={() => setSideHover(null)} onClick={onSideMove} />
                  <span className="viewer-tag epoch mono" role="status">{cur?.label ?? '—'}</span>
                </div>
              </div>
            ) : (
              <>
                <canvas
                  ref={mainRef}
                  id="blinkCanvas"
                  role="img"
                  aria-label={`${title} — ${cur?.label ?? 'no frame'}. Focus and use arrow keys to move the measuring crosshair, Enter to measure.`}
                  tabIndex={0}
                  style={{ width: '100%', height: '100%', display: 'block', cursor: onSample ? 'crosshair' : 'grab' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onClick={onClickSample}
                  onKeyDown={onCanvasKey}
                />
                <span className="viewer-tag mono">{modeLabel}</span>
                <span className="viewer-tag epoch mono" role="status">{cur?.label ?? '—'}</span>
                {cur?.png && !curImg && failed[cur.png] && (
                  <button type="button" className="frame-retry" onClick={() => retryUrl(cur.png as string)}>
                    ↻ Retry frame
                  </button>
                )}
                {measureChip && (
                  <div className="measure-chip mono"
                    style={{ left: `${measureChip.x * 100}%`, top: `${measureChip.y * 100}%` }}>
                    <button type="button" aria-label="Dismiss measurement"
                      onClick={(e) => { e.stopPropagation(); setMeasureChip(null); }}>×</button>
                    <span>px {measureChip.lum} · {measureChip.label}</span>
                  </div>
                )}
              </>
            )}
          </div>
        <div className="controls-zone">
          <div className="transport-row glass" role="group" aria-label="Blink transport">
            <button type="button" className="icon-btn pressable" onClick={() => step(-1)} aria-label="Previous epoch">
              <Icon name="back" />
            </button>
            <button type="button" className="play mini pressable" onClick={() => setPlaying((pp) => (n > 1 ? !pp : pp))}
              aria-label={playing ? 'Pause blink' : 'Play blink'}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="icon-btn pressable" onClick={() => step(1)} aria-label="Next epoch">
              <Icon name="fwd" />
            </button>
            <input className="scrub" type="range" min={0} max={Math.max(0, n - 1)} step={1} value={idx}
              style={{ '--val': `${scrubPct}%` } as CSSProperties}
              onChange={(e) => { setPlaying(false); onEpochChange(Number(e.target.value)); }}
              aria-label="Timeline scrub" aria-valuetext={cur?.label ?? ''} />
            <span className="mono epoch-name">{cur?.label ?? '—'}</span>
          </div>

          <div className="filmstrip" role="group" aria-label="Epoch filmstrip">
            {frames.map((f, i) => {
              // replay dims pairs with no measured motion (both decoded, zero
              // candidates): the transport skips them, the strip shows why.
              const a = frames[(i - 1 + n) % n];
              const pairDone = !!(a.png && f.png && loaded[a.png] && loaded[f.png]);
              const blank = mode === 'replay' && pairDone && !pairMotion[i];
              return (
              <button key={`${f.label}::${i}`} type="button"
                onClick={() => { setPlaying(false); onEpochChange(i); if (f.png && failed[f.png]) retryUrl(f.png); }}
                className={`film${i === idx ? ' active' : ''}${f.png && failed[f.png] ? ' failed' : ''}${blank ? ' blank' : ''}`}
                aria-pressed={i === idx}
                title={f.png && failed[f.png] ? `${f.label} · load failed — click to retry` : (f.mjd ? `${f.label} · MJD ${f.mjd}` : f.label) + (blank ? ' · no motion in this pair' : '')}>
                {f.png && loaded[f.png] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={loaded[f.png].src} alt="" draggable={false} />
                ) : (
                  <span className="film-empty">{f.png && failed[f.png] ? '↻' : (f.mjd ? String(Math.round(f.mjd)).slice(2) : `E${i + 1}`)}</span>
                )}
              </button>
              );
            })}
            <label className="rate">Rate
              <input type="range" min={150} max={1200} step={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Blink rate" />
            </label>
            {doneFrames < totalFrames && (
              <span className="mono film-count" role="status">loading frames {doneFrames}/{totalFrames}</span>
            )}
          </div>
        </div>
        </div>
        <aside className="tweak-left glass" aria-label="Image controls">
          <section className="ws-sec" aria-label="View">
            <h3 className="ws-title">View</h3>
            <div className="seg seg-full" role="group" aria-label="Compare mode">
              {(['blink', 'side', 'swipe', 'diff', 'replay', 'color'] as CompareMode[]).map((m) => (
                <button key={m} type="button" className={`seg-btn${mode === m ? ' active' : ''}`} aria-pressed={mode === m}
                  onClick={() => onModeChangeWrap(m)}
                  title={m === 'color' ? 'Motion color: epoch B red, epoch A green' : undefined}>
                  {m === 'blink' ? 'Blink' : m === 'side' ? 'Side' : m === 'swipe' ? 'Swipe' : m === 'diff' ? 'Diff' : m === 'replay' ? 'Replay' : 'Color'}
                </button>
              ))}
            </div>
            {mode === 'replay' && (
              <p className="ws-hint">Simulated replay: detected movers fly their measured vectors, blanks auto-skipped. Rendered — not pixels.</p>
            )}
            {mode === 'diff' && (
              <label className="ws-level"><span>Gain</span>
                <input type="range" min={1} max={8} step={0.5} value={diffScale} onChange={(e) => setDiffScale(Number(e.target.value))} aria-label="Difference gain" />
                <output>{diffScale.toFixed(1)}×</output>
              </label>
            )}
            {mode === 'swipe' && (
              <label className="ws-level"><span>Curtain</span>
                <input type="range" min={2} max={98} value={Math.round(swipe * 100)} onChange={(e) => setSwipe(Number(e.target.value) / 100)} aria-label="Swipe position" />
                <output>{Math.round(swipe * 100)}%</output>
              </label>
            )}
          </section>

          <section className="ws-sec" aria-label="Display">
            <h3 className="ws-title">Display</h3>
            <div className="ws-row">
              <label className="ws-field">Stretch
                <select value={stretch} onChange={(e) => setStretch(e.target.value as Stretch)} aria-label="Stretch method">
                  <option value="linear">linear</option>
                  <option value="log">log</option>
                  <option value="sqrt">sqrt</option>
                  <option value="asinh">asinh</option>
                </select>
              </label>
              <label className="ws-field">Color
                <select value={cmap} onChange={(e) => setCmap(e.target.value as Colormap)} aria-label="Color mode">
                  <option value="grayscale">grayscale</option>
                  <option value="cividis">cividis ✓ colorblind-safe</option>
                  <option value="viridis">viridis</option>
                  <option value="inferno">inferno</option>
                </select>
              </label>
              <button type="button" className={`ws-btn${invert ? ' active' : ''}`} aria-pressed={invert} onClick={() => setInvert((v) => !v)}>Invert</button>
            </div>
            <div className="ws-sub">Presets</div>
            <div className="ws-row" role="group" aria-label="Brightness presets">
              {(['faint', 'balanced', 'bright'] as const).map((pp) => (
                <button key={pp} type="button" className={`ws-btn pressable${activePreset === pp ? ' active' : ''}`}
                  aria-pressed={activePreset === pp} onClick={() => setPreset(pp)}>{pp}</button>
              ))}
            </div>
            <div className="ws-sub">Levels</div>
            <label className="ws-level"><span>Black</span>
              <input type="range" min={0} max={50} value={Math.round(vmin * 100)} onChange={(e) => setVmin(Number(e.target.value) / 100)} aria-label="Black point" />
              <output>{Math.round(vmin * 100)}%</output>
            </label>
            <label className="ws-level"><span>White</span>
              <input type="range" min={50} max={100} value={Math.round(vmax * 100)} onChange={(e) => setVmax(Number(e.target.value) / 100)} aria-label="White point" />
              <output>{Math.round(vmax * 100)}%</output>
            </label>
          </section>

          <section className="ws-sec" aria-label="Bands">
            <h3 className="ws-title">Bands</h3>
            <div className="band-grid" role="group" aria-label="Detector band">
              {BANDS.map((b) => (
                <button key={b.id} type="button" className={`band-cell pressable${b.id === band ? ' active' : ''}`}
                  aria-pressed={b.id === band}
                  disabled={!hasBandData(b.id)}
                  style={{ '--band-color': b.color } as CSSProperties}
                  title={hasBandData(b.id) ? `${b.label}: ${b.range}` : `${b.label}: no epochs in this field`}
                  onClick={() => setBandAndChannel(b.id)}>
                  <span className="sw" style={{ background: b.color }} />
                  <span>Band {b.id}</span>
                </button>
              ))}
            </div>
            <p className="ws-meta">{bandMeta.label} · {bandMeta.range} · 102 channels · same-band blink only</p>
            <div className="ws-sub">Channel</div>
            <label className="ws-field">Spectral channel
              <select value={channel} onChange={(e) => setChannel(Number(e.target.value))} aria-label="Spectral channel">
                {detChannels.map((c) => (
                  <option key={c.idx} value={c.idx}>#{c.idx + 1} · {c.wave_um.toFixed(2)} µm</option>
                ))}
              </select>
            </label>
            <div className="ws-sub">RGB mapping</div>
            <div className="ws-row" role="group" aria-label="RGB channel mapping">
              {(['R', 'G', 'B'] as const).map((k, ki) => (
                <label key={k} className="ws-field rgb">{k}
                  <select value={rgb[ki]} aria-label={`${k} channel`}
                    onChange={(e) => setRgb(([r, g, b]) => { const v = [r, g, b] as [number, number, number]; v[ki] = Number(e.target.value); return v; })}>
                    {CHANNELS.map((c) => <option key={c.idx} value={c.idx}>#{c.idx + 1}</option>)}
                  </select>
                </label>
              ))}
              <button
                type="button" className={`ws-btn${falseColor ? ' active' : ''}`} aria-pressed={falseColor}
                onClick={() => setFalseColor((v) => !v)}
                disabled={Object.values(bandPngs ?? {}).filter(Boolean).length < 3}
                title={Object.values(bandPngs ?? {}).filter(Boolean).length < 3
                  ? 'Needs 3+ band images (still indexing)'
                  : 'Render the chosen R/G/B detector images as false color'}
              >
                {falseColor ? '✓ Show in color' : 'Show in color'}
              </button>
            </div>
          </section>

          <section className="ws-sec" aria-label="Measure">
            <h3 className="ws-title">Measure</h3>
            <p className="ws-hint">Click the image to measure that spot.</p>
            <div className="ws-result mono" aria-live="polite">
              {measureChip
                ? <>px {measureChip.lum} · {measureChip.label}</>
                : probe
                  ? <>px {probe.lum}{Number.isFinite(probe.ra) ? <> · {probe.ra.toFixed(3)}°, {probe.dec >= 0 ? '+' : ''}{probe.dec.toFixed(3)}°</> : ' · hover'}</>
                  : 'No measurement yet'}
            </div>
            <div className="ws-sub">Spectrum</div>
            <div className="ws-inset">
              {specVals ? (
                <SpectrumPlot values={specVals} band={band} />
              ) : (
                <p className="ws-hint">Measure a spot to draw its spectrum.</p>
              )}
            </div>
            <div className="ws-sub">Change map</div>
            <p className="ws-status">
              <span ref={diffStatRef} className="mono" style={{ color: '#e8c34a' }} />
              {mode !== 'diff' && <span className="mono">Switch to Diff to quantify change</span>}
            </p>
            <div className="ws-sub">Status</div>
            <p className="ws-status">
              {candidates.length
                ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} — real pixel differencing, ≥5σ`
                : 'Scanning pixels for movers…'}
            </p>
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
                <p className="ws-status">No movers above 5σ between these epochs — quiet field.</p>
              )
            )}
            <canvas ref={histRef} className="hist" aria-label="Brightness histogram of the displayed frame" />
          </section>
        </aside>



      </div>

      {/* command palette */}
      {palette && (
        <div className="pal-veil" onMouseDown={() => setPalette(false)}>
          <div className="palette glass" role="dialog" aria-modal="true" aria-label="Command palette"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setPalette(false); return; }
              if (e.key !== 'Tab') return;
              const items = [...(e.currentTarget.querySelectorAll<HTMLElement>(
                'button, input, [tabindex]:not([tabindex="-1"])'))]
                .filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
              if (!items.length) return;
              const first = items[0];
              const last = items[items.length - 1];
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }}>
            <input autoFocus value={palQ} onChange={(e) => { setPalQ(e.target.value); setPalActive(0); }}
              placeholder="Type a command or epoch…" aria-label="Command search"
              aria-activedescendant={palHits[palActive] ? `pal-opt-${palActive}` : undefined}
              aria-controls="pal-listbox" role="combobox" aria-expanded="true" aria-autocomplete="list"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && palHits[palActive]) { palHits[palActive].run(); setPalette(false); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); setPalActive((a) => Math.min(palHits.length - 1, a + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setPalActive((a) => Math.max(0, a - 1)); }
              }} />
            <div className="pal-list" role="listbox" id="pal-listbox" aria-label="Commands">
              {palHits.map((c, i) => (
                <button key={`${c.name}::${i}`} id={`pal-opt-${i}`} type="button" role="option"
                  aria-selected={i === palActive} data-active={i === palActive}
                  onMouseMove={() => setPalActive(i)}
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
