'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { BANDS } from '@/lib/sky';
import { CHANNELS, applyStretch, colormap, type Colormap, type Stretch } from '@/lib/astro';

export interface BlinkFrame {
  label: string;
  png?: string | null;
  note?: string;
  obs_id?: string;
  mjd?: number;
}

type Mode = 'blink' | 'side' | 'swipe' | 'diff';

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

/** Apply stretch/colormap/invert to canvas in place using percentile-clipped gray source. */
function stylize(canvas: HTMLCanvasElement, stretch: Stretch, vmin: number, vmax: number, invert: boolean, cm: Colormap, diffMode: boolean, diffScale: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return; // tainted canvas (shouldn't happen with same-origin PNGs)
  }
  const px = data.data;
  const span = Math.max(1e-6, vmax - vmin);
  for (let i = 0; i < px.length; i += 4) {
    // luminance of source pixel
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    let t: number;
    if (diffMode) {
      // diff canvas pre-filled with signed data mapped 0..1 around 0.5 externally
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

export default function BlinkComparator({
  frames, band, onBandChange, title, mode, onModeChange, epochIdx, onEpochChange,
  showMarkers, fovArcmin = 10, onSample,
}: {
  frames: BlinkFrame[]; band: number; onBandChange: (b: number) => void; title: string;
  mode: Mode; onModeChange: (m: Mode) => void;
  epochIdx: number; onEpochChange: (i: number) => void;
  showMarkers: boolean; fovArcmin?: number;
  onSample?: (args: { x: number; y: number; values: number[] }) => void;
}) {
  const n = frames.length;
  const idx = Math.min(epochIdx, n - 1);
  const prevIdx = (idx - 1 + n) % n;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(550);
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

  const mainRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // preload all frames
  useEffect(() => {
    let alive = true;
    const urls = [...new Set(frames.map((f) => f.png).filter((u): u is string => !!u))];
    void Promise.all(urls.map((u) => loadImage(u).then((img) => ({ u, img })).catch(() => null))).then((arr) => {
      if (!alive) return;
      const map: Record<string, HTMLImageElement> = {};
      for (const e of arr) if (e) map[e.u] = e.img;
      setLoaded(map);
    });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => (n > 1 ? !p : p)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, n]);

  const cur = frames[idx];
  const prev = frames[prevIdx];
  const curImg = cur?.png ? loaded[cur.png] : undefined;
  const prevImg = prev?.png ? loaded[prev.png] : undefined;
  const bandMeta = BANDS[band - 1];
  const detChannels = useMemo(() => CHANNELS.filter((c) => c.detector === band), [band]);

  // render main canvas
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const w = host.clientWidth;
    const h = host.clientWidth; // square stage
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);

    if (mode === 'side') return; // side canvases render separately
    if (showRgb && curImg && prevImg) {
      // motion false-color: R=epoch B, G=epoch A, B=|B-A| — movers pop as red/green pairs
      const mk = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = Math.round(w); c.height = Math.round(h);
        const cctx = c.getContext('2d', { willReadFrequently: true });
        if (cctx) drawCover(cctx, img, w, h, pan, zoom);
        return cctx?.getImageData(0, 0, c.width, c.height);
      };
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
      // B minus A via two offscreens
      const mk = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = Math.round(w); c.height = Math.round(h);
        const cctx = c.getContext('2d', { willReadFrequently: true });
        if (cctx) drawCover(cctx, img, w, h, pan, zoom);
        return cctx?.getImageData(0, 0, c.width, c.height);
      };
      const A = mk(prevImg);
      const B = mk(curImg);
      if (A && B) {
        const out = ctx.createImageData(Math.round(w), Math.round(h));
        for (let i = 0; i < out.data.length; i += 4) {
          const la = (A.data[i] * 0.299 + A.data[i + 1] * 0.587 + A.data[i + 2] * 0.114) / 255;
          const lb = (B.data[i] * 0.299 + B.data[i + 1] * 0.587 + B.data[i + 2] * 0.114) / 255;
          const d = (lb - la) * 0.5 + 0.5; // signed around mid-gray
          const g = Math.round(d * 255);
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
        // curtain line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(swipe * w, 0); ctx.lineTo(swipe * w, h); ctx.stroke();
      }
    } else if (curImg) {
      drawCover(ctx, curImg, w, h, pan, zoom);
      stylize(canvas, stretch, vmin, vmax, invert, cmap, false, diffScale);
    } else {
      // placeholder grid
      ctx.fillStyle = '#aab0c8';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Cutout pending — story + metadata below work offline.', w / 2, h / 2);
    }

    // markers: motion vector across epochs (demo: center dipole + trail)
    if (showMarkers) {
      const cx = w / 2 + pan.x;
      const cy = h / 2 + pan.y;
      ctx.strokeStyle = '#f0bb52';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(cx - 26 * zoom, cy + 18 * zoom); ctx.lineTo(cx + 26 * zoom, cy - 18 * zoom); ctx.stroke();
      ctx.setLineDash([]);
      for (const [px, py, label] of [[cx - 26 * zoom, cy + 18 * zoom, 'A'], [cx + 26 * zoom, cy - 18 * zoom, 'B']] as const) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        const b = 12;
        ctx.strokeRect(px - b / 2, py - b / 2, b, b);
        ctx.fillStyle = '#fff';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(label, px + 10, py - 8);
      }
      // compass N/E
      ctx.fillStyle = 'rgba(238,240,248,.9)';
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText('N ↑', 14, 22);
      ctx.fillText('E ←', 14, 38);
    } else {
      const ctx2 = ctx;
      ctx2.fillStyle = 'rgba(238,240,248,.75)';
      ctx2.font = '600 12px ui-monospace, monospace';
      ctx2.fillText('N ↑   E ←', 14, 22);
    }
    // scale bar
    const barW = Math.max(30, (w * 1) / fovArcmin); // ~1 arcmin
    ctx.fillStyle = 'rgba(238,240,248,.9)';
    ctx.fillRect(w - barW - 14, h - 18, barW, 3);
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('1′', w - 14, h - 24);
    ctx.textAlign = 'left';
  }, [curImg, prevImg, mode, stretch, vmin, vmax, invert, cmap, diffScale, swipe, pan, zoom, showMarkers, showRgb, fovArcmin, idx]);

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
        // stylize needs the canvas element itself
        stylize(canvas, stretch, vmin, vmax, invert, cmap, false, diffScale);
      }
    }
  }, [mode, prevImg, curImg, pan, zoom, stretch, vmin, vmax, invert, cmap, diffScale]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pan: { ...pan } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === 'swipe' && e.buttons === 0 && e.pointerType === 'mouse') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSwipe(Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)));
    }
    if (!drag.current) return;
    setPan({ x: drag.current.pan.x + (e.clientX - drag.current.x), y: drag.current.pan.y + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(6, Math.max(0.6, z * (e.deltaY > 0 ? 0.92 : 1.09))));
  };
  const onClickSample = (e: React.MouseEvent) => {
    if (!onSample) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    // sample current canvas luminance per band frame as pseudo-spectrum
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

  const downloadPNG = () => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `spectrahunt-${cur?.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'frame'}.png`;
    a.click();
  };

  const recordWebM = async () => {
    const canvas = mainRef.current;
    if (!canvas || n < 2 || recording) return;
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    setRecording(true);
    rec.start();
    const prevPlaying = playing;
    setPlaying(false);
    for (let i = 0; i < n; i++) {
      onEpochChange(i);
      await new Promise((r) => setTimeout(r, Math.max(250, speed)));
    }
    rec.stop();
    const blob = await done;
    setRecording(false);
    if (prevPlaying) setPlaying(true);
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

  return (
    <div className="viewer">
      <div className="viewer-stage" style={{ touchAction: 'none' }}>
        {mode === 'side' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' }}>
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
              style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onWheel={onWheel}
              onClick={onClickSample}
            />
            <span className="viewer-tag mono">{mode === 'diff' ? 'Difference B−A' : mode === 'swipe' ? 'Swipe A | B' : showRgb ? 'Motion color' : 'Raw frames'}</span>
            <span className="viewer-tag epoch mono">{cur?.label ?? '—'}</span>
          </>
        )}
      </div>

      {/* timeline slider with date ticks */}
      <div style={{ padding: '12px 18px 0', background: 'var(--space-2)' }}>
        <label htmlFor="epochSlider" style={{ fontSize: 12, color: '#8a90ab' }}>
          Timeline — {n} epochs · drag or use ←/→
        </label>
        <input
          id="epochSlider"
          type="range" min={0} max={Math.max(0, n - 1)} step={1} value={idx}
          onChange={(e) => { setPlaying(false); onEpochChange(Number(e.target.value)); }}
          style={{ width: '100%', accentColor: '#7c83fd' }}
          aria-valuetext={cur?.label ?? ''}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a90ab', fontFamily: 'monospace' }}>
          {frames.map((f, i) => (
            <button
              key={f.label} type="button" onClick={() => { setPlaying(false); onEpochChange(i); }}
              style={{ background: 'none', border: 0, color: i === idx ? '#fff' : '#8a90ab', cursor: 'pointer', padding: '2px 4px' }}
              aria-pressed={i === idx}
              title={f.mjd ? `MJD ${f.mjd}` : f.label}
            >
              {f.mjd ? String(Math.round(f.mjd)).slice(2) : `E${i + 1}`}
            </button>
          ))}
        </div>
      </div>

      <div className="viewer-controls">
        <div className="transport">
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous epoch">
            <Icon name="back" />
          </button>
          <button
            type="button" className="play" onClick={() => setPlaying((p) => (n > 1 ? !p : p))}
            aria-label={playing ? 'Pause blink' : 'Play blink'}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next epoch">
            <Icon name="fwd" />
          </button>
          <label className="speed">
            <span>Blink rate</span>
            <input
              type="range" min={150} max={1200} step={10} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
            <output>{speed} ms</output>
          </label>
        </div>

        <div className="diff-row" role="group" aria-label="Compare mode">
          {(['blink', 'side', 'swipe', 'diff'] as Mode[]).map((m) => (
            <button
              key={m} type="button" className="epoch-chip"
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              style={mode === m ? { color: '#fff', borderColor: '#7c83fd' } : undefined}
            >
              {m === 'blink' ? 'Blink' : m === 'side' ? 'Side-by-side' : m === 'swipe' ? 'Swipe' : 'Difference'}
            </button>
          ))}
          <button
            type="button" className="epoch-chip"
            aria-pressed={showRgb}
            onClick={() => setShowRgb((v) => !v)}
            title="False-color: epoch B → red, epoch A → green"
          >
            Motion color
          </button>
        </div>
        {mode === 'diff' && (
          <label className="speed">
            <span>Diff scale</span>
            <input type="range" min={1} max={8} step={0.5} value={diffScale} onChange={(e) => setDiffScale(Number(e.target.value))} />
            <output>{diffScale.toFixed(1)}×</output>
          </label>
        )}
        {mode === 'swipe' && (
          <label className="speed">
            <span>Curtain</span>
            <input type="range" min={2} max={98} value={Math.round(swipe * 100)} onChange={(e) => setSwipe(Number(e.target.value) / 100)} />
            <output>{Math.round(swipe * 100)}%</output>
          </label>
        )}
        <p className="keys"><kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> step · drag to pan · scroll to zoom · click image for spectrum</p>

        {/* image controls */}
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#aab0c8' }}>Image: stretch, scale, colormap</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 13 }}>
            <label>Stretch{' '}
              <select value={stretch} onChange={(e) => setStretch(e.target.value as Stretch)} style={{ background: '#151929', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
                <option value="linear">linear</option>
                <option value="log">log</option>
                <option value="sqrt">sqrt</option>
                <option value="asinh">asinh</option>
              </select>
            </label>
            <label>Colormap{' '}
              <select value={cmap} onChange={(e) => setCmap(e.target.value as Colormap)} style={{ background: '#151929', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px' }}>
                <option value="cividis">cividis (colorblind-safe)</option>
                <option value="grayscale">grayscale</option>
                <option value="viridis">viridis</option>
                <option value="inferno">inferno</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Invert
            </label>
            {(['faint', 'balanced', 'bright'] as const).map((p) => (
              <button key={p} type="button" className="epoch-chip" onClick={() => setPreset(p)}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            <label className="speed"><span>Black {Math.round(vmin * 100)}%</span>
              <input type="range" min={0} max={50} value={Math.round(vmin * 100)} onChange={(e) => setVmin(Number(e.target.value) / 100)} />
            </label>
            <label className="speed"><span>White {Math.round(vmax * 100)}%</span>
              <input type="range" min={50} max={100} value={Math.round(vmax * 100)} onChange={(e) => setVmax(Number(e.target.value) / 100)} />
            </label>
          </div>
        </details>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="epoch-chip" onClick={downloadPNG}>Download PNG</button>
          <button type="button" className="epoch-chip" onClick={recordWebM} disabled={recording || n < 2}>
            {recording ? 'Recording…' : 'Record WebM'}
          </button>
          <button type="button" className="epoch-chip" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset view</button>
        </div>
      </div>

      <div className="band-row">
        {BANDS.map((b) => (
          <button
            key={b.id} type="button" className="band"
            style={{ ['--band-color' as string]: b.color }}
            aria-pressed={b.id === band}
            onClick={() => {
              onBandChange(b.id);
              const ch = CHANNELS.filter((c) => c.detector === b.id);
              setChannel(ch[Math.floor(ch.length / 2)]?.idx ?? 0);
            }}
            title={`${b.label}: ${b.range}`}
          >
            <span className="sw" style={{ background: b.color }} />{b.label}
          </button>
        ))}
      </div>
      <div className="band-row" style={{ paddingTop: 0 }}>
        <label style={{ fontSize: 12, color: '#8a90ab', display: 'flex', alignItems: 'center', gap: 8 }}>
          Channel{' '}
          <select
            value={channel}
            onChange={(e) => setChannel(Number(e.target.value))}
            style={{ background: '#151929', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px', maxWidth: 220 }}
            aria-label="Spectral channel within detector"
          >
            {detChannels.map((c) => (
              <option key={c.idx} value={c.idx}>#{c.idx + 1} · {c.wave_um.toFixed(2)} µm</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 12, color: '#8a90ab' }}>
          {bandMeta.label} ({bandMeta.range}) · 102 channels total · same-band blink only
        </span>
      </div>
      <div className="band-row" style={{ paddingTop: 0 }}>
        <label style={{ fontSize: 12, color: '#8a90ab', display: 'flex', alignItems: 'center', gap: 8 }}>
          RGB composite{' '}
          <select value={rgb[0]} onChange={(e) => setRgb([Number(e.target.value), rgb[1], rgb[2]])} aria-label="Red channel" style={{ background: '#151929', border: '1px solid #e85d4a', borderRadius: 8, padding: '4px' }}>
            {CHANNELS.map((c) => <option key={c.idx} value={c.idx}>#{c.idx + 1}</option>)}
          </select>
          <select value={rgb[1]} onChange={(e) => setRgb([rgb[0], Number(e.target.value), rgb[2]])} aria-label="Green channel" style={{ background: '#151929', border: '1px solid #4fc9a8', borderRadius: 8, padding: '4px' }}>
            {CHANNELS.map((c) => <option key={c.idx} value={c.idx}>#{c.idx + 1}</option>)}
          </select>
          <select value={rgb[2]} onChange={(e) => setRgb([rgb[0], rgb[1], Number(e.target.value)])} aria-label="Blue channel" style={{ background: '#151929', border: '1px solid #5aa9e6', borderRadius: 8, padding: '4px' }}>
            {CHANNELS.map((c) => <option key={c.idx} value={c.idx}>#{c.idx + 1}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: '#8a90ab' }}>R #{rgb[0] + 1} · G #{rgb[1] + 1} · B #{rgb[2] + 1} (false-color; needs per-band cutouts in live mode)</span>
      </div>
      <div className="band-row" style={{ paddingTop: 0 }}>
        {frames.map((f, i) => (
          <button
            key={f.label} type="button" className="epoch-chip"
            aria-pressed={i === idx}
            onClick={() => { setPlaying(false); onEpochChange(i); }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
