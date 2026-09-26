'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyStretch, colormap, type Colormap } from '@/lib/astro';
import { BANDS } from '@/lib/sky';
import { getShowcase, type Showcase } from '@/lib/showcases';
import { loadCachedImage } from '@/lib/skycache';
import { blinkURL, useAppStore } from '@/lib/store';

type Preset = 'grayscale' | 'color' | 'colorblind';
const PRESET_CMAP: Record<Preset, Colormap> = {
  grayscale: 'grayscale',
  color: 'viridis',
  colorblind: 'cividis',
};
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, pan: { x: number; y: number }, zoom: number) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, (w - dw) / 2 + pan.x, (h - dh) / 2 + pan.y, dw, dh);
}

function shortStory(s: string, max = 150): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/**
 * Artifact preview: the default first layer between discovery and analysis.
 * Visual-first modal over existing showcase data — slim canvas (autoplay,
 * step, pan/zoom, cached loads), three presets, one road into the full
 * blink workspace. Opens from every discovery surface via openPreview(id).
 */
export default function ArtifactPreview() {
  const router = useRouter();
  const previewId = useAppStore((s) => s.previewId);
  const closePreview = useAppStore((s) => s.closePreview);
  const [data, setData] = useState<Showcase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [epochIdx, setEpochIdx] = useState(0);
  const [playing, setPlaying] = useState(() => useAppStore.getState().autoplay);
  const [preset, setPreset] = useState<Preset>(() => (useAppStore.getState().colorblind ? 'colorblind' : 'color'));
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement | undefined>(undefined);
  // view mirror for clamping (zoom/pan always keep the frame covering)
  const vpRef = useRef({ zoom: 1, x: 0, y: 0 });

  /** Zoom never goes below cover (no empty canvas); pan never leaves the frame. */
  const clampView = (zoom: number, px: number, py: number) => {
    const z = Math.min(8, Math.max(1, zoom));
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return { z, x: 0, y: 0 };
    const host = canvas.parentElement;
    if (!host) return { z, x: 0, y: 0 };
    const w = host.clientWidth;
    const h = host.clientHeight;
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

  // load showcase per open
  useEffect(() => {
    if (!previewId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setErr(null);
    setEpochIdx(0);
    // respect the stored autoplay setting (audit: was forced true on open)
    setPlaying(useAppStore.getState().autoplay);
    setLoaded({});
    setFailed({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
    vpRef.current = { zoom: 1, x: 0, y: 0 };
    void getShowcase(previewId)
      .then((d) => { if (alive) setData(d.id === previewId ? d : null); })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [previewId]);

  // lock body scroll + focus + esc/trap while open
  useEffect(() => {
    if (!previewId) return;
    const prev = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePreview(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [previewId, closePreview]);

  const epochs = useMemo(() => data?.epochs ?? [], [data]);
  const n = epochs.length;
  const idx = Math.min(epochIdx, Math.max(0, n - 1));
  const cur = epochs[idx];
  const band = data?.epochs[0]?.band ?? 3;
  const bandMeta = BANDS[band - 1];

  // cached image loads (same device cache as the blink workspace)
  useEffect(() => {
    if (!previewId) return;
    let alive = true;
    const urls = [...new Set(epochs.map((e) => e.png).filter((u): u is string => !!u))];
    for (const u of urls) {
      void loadCachedImage(u).then((img) => {
        if (alive) setLoaded((m) => (m[u] ? m : { ...m, [u]: img }));
      }).catch(() => {
        if (alive) setFailed((m) => (m[u] ? m : { ...m, [u]: true }));
      });
    }
    return () => { alive = false; };
  }, [epochs, previewId]);

  const curImg = cur?.png ? loaded[cur.png] : undefined;
  useEffect(() => { imgRef.current = curImg; }, [curImg]);

  // autoplay (still image when reduced motion or single frame)
  useEffect(() => {
    if (!playing || n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setEpochIdx((i) => (i + 1) % n), 900);
    return () => clearInterval(t);
  }, [playing, n]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    setEpochIdx((i) => (i + d + n) % n);
  }, [n]);

  // keyboard transport (outside text fields)
  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === ' ') {
        const btag = (e.target as HTMLElement).tagName;
        if (['BUTTON', 'A'].includes(btag)) return;
        e.preventDefault();
        setPlaying((p) => (n > 1 ? !p : p));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewId, n, step]);

  // render
  const [stageTick, setStageTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewId) return;
    const host = canvas.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => setStageTick((t) => t + 1));
    ro.observe(host);
    return () => ro.disconnect();
  }, [previewId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewId) return;
    const host = canvas.parentElement;
    if (!host) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);
    if (curImg) {
      drawCover(ctx, curImg, w, h, pan, zoom);
      // restyle: fixed gentle asinh + chosen preset colormap
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
          let t = Math.min(1, Math.max(0, (lum - 0.05) / 0.93));
          t = applyStretch(t, 'asinh');
          const [r, g, b] = colormap(t, PRESET_CMAP[preset]);
          px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
      } catch { /* tainted canvas: show raw frame */ }
    } else if (cur?.png) {
      ctx.fillStyle = 'rgba(238,240,248,.8)';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(failed[cur.png] ? 'Frame failed — opening analysis still works' : 'Loading frame…', w / 2, h / 2);
    } else {
      ctx.fillStyle = '#aab0c8';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Cutout pending — story below is real, analysis has the metadata.', w / 2, h / 2);
    }
  }, [curImg, cur?.png, preset, pan, zoom, previewId, stageTick, failed]);

  // non-passive wheel zoom (free range: zoom out past 100% welcome)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !previewId) return;
    // no wheel-zoom on the porch: scroll belongs to the page, not the
    // picture (audit). Pinch/drag pan stay for touch; double-click resets.
    const onDbl = () => applyView(1, 0, 0);
    stage.addEventListener('dblclick', onDbl);
    return () => {
      stage.removeEventListener('dblclick', onDbl);
    };
  }, [previewId]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, pan: { x: vpRef.current.x, y: vpRef.current.y }, moved: false };
    } else {
      drag.current = null; // multi-touch: pinch takes over
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom,
      };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      if (pinch.current) {
        const ratio = dist / Math.max(20, pinch.current.dist);
        applyView(pinch.current.zoom * ratio, vpRef.current.x, vpRef.current.y);
      } else {
        pinch.current = { dist, zoom };
      }
      return;
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
    else return;
    applyView(vpRef.current.zoom, drag.current.pan.x + dx, drag.current.pan.y + dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [, pt] = [...pointers.current.entries()][0];
      drag.current = { x: pt.x, y: pt.y, pan: { x: vpRef.current.x, y: vpRef.current.y }, moved: true };
      return;
    }
    drag.current = null;
  };

  const goAdvanced = () => {
    if (!data) return;
    const id = data.id;
    useAppStore.getState().setEntryCmap(PRESET_CMAP[preset]);
    closePreview();
    router.push(blinkURL(id, { band: cur?.band ?? band, epoch: idx, mode: 'blink', cmap: PRESET_CMAP[preset] }));
  };

  if (!previewId) return null;
  return (
    <div className="pv-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) closePreview(); }}>
      <div ref={panelRef} className="pv-panel glass" role="dialog" aria-modal="true"
        aria-label={data ? `Preview: ${data.title}` : 'Artifact preview'}>
        <button ref={closeRef} type="button" className="pv-close pressable" aria-label="Close preview"
          style={{ minWidth: 44, minHeight: 44 }}
          onClick={closePreview}>×</button>
        {!data && !err && <div className="pv-loading" role="status" aria-label="Loading preview"><span /></div>}
        {err && !data && (
          <div className="pv-status error">
            Couldn’t load this field: {err}.
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Link className="epoch-chip" href={blinkURL(previewId, { band, epoch: idx, mode: 'blink' })} onClick={closePreview}>
                Open analysis anyway
              </Link>
            </div>
          </div>
        )}
        {data && (
          <div className="pv-grid">
            <div className="pv-stage" ref={stageRef}>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${data.title} — ${cur?.label ?? 'no frame'}`}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab', touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <span className="viewer-tag mono">{cur?.band ? `D${cur.band}` : bandMeta?.label ?? ''} · Frame {idx + 1} of {n} · real IRSA cutout</span>
              {n > 1 && (
                <div className="pv-transport" role="group" aria-label="Frame transport">
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }} onClick={() => step(-1)} aria-label="Previous frame">‹</button>
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }} onClick={() => setPlaying((p) => (n > 1 ? !p : p))}
                    aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }} onClick={() => step(1)} aria-label="Next frame">›</button>
                  <span className="mono pv-count" aria-live="off">{idx + 1}/{n}</span>
                </div>
              )}
            </div>
            <div className="pv-side">
              <p className="hero-kicker">Archival infrared · blinks because the sky changed</p>
              <h2>{data.title}</h2>
              <p className="pv-story">{shortStory(data.story, 220)}</p>
              <p className="fine">Measured in {Object.keys(data.bands ?? {}).length} bands — full spectrum lives in analysis.</p>
              <p className="fine mono">Cutouts: NASA/IRSA · cached on device.</p>
              <div className="pv-cta-box">
                <button type="button" className="btn primary pv-cta" onClick={goAdvanced}>
                  Open blink workspace →
                </button>
                <p className="fine">Frame {idx + 1} of {n} · {cur?.label ?? bandMeta?.label ?? ''} · continues where you left off.</p>
                <button type="button" className="epoch-chip" aria-pressed={preset === 'colorblind'}
                  style={{ marginTop: 8 }} onClick={() => {
                    const next = preset === 'colorblind' ? 'color' : 'colorblind';
                    setPreset(next);
                    useAppStore.getState().setColorblind(next === 'colorblind');
                  }}>
                  {preset === 'colorblind' ? '✓ Colorblind-safe' : 'Colorblind-safe'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
