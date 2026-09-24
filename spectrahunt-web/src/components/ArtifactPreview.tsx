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
const PRESETS: Array<{ id: Preset; label: string; hint: string; sw: string }> = [
  { id: 'grayscale', label: 'Grayscale', hint: 'Neutral luminance view', sw: 'linear-gradient(135deg,#111,#eee)' },
  { id: 'color', label: 'Color', hint: 'Full-range color view', sw: 'linear-gradient(135deg,#440154,#21918c,#fde725)' },
  { id: 'colorblind', label: 'Colorblind-friendly', hint: 'Perceptually uniform, color-vision-deficiency safe', sw: 'linear-gradient(135deg,#00224e,#7ad151,#fee838)' },
];

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
  const [playing, setPlaying] = useState(true);
  const [preset, setPreset] = useState<Preset>('color');
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  // Render state lives in refs, never React state (canvas-sky-engine): pan
  // and zoom mutate `view.current` and schedule a frame via `kick` — no
  // per-move setState, one RAF at a time, draw only when dirty.
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const rafRef = useRef(0);
  const drawRef = useRef(() => {});
  const kick = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawRef.current();
    });
  }, []);
  // Reused scratch staging canvas (zero per-frame allocation) whose context
  // carries `willReadFrequently` for the pixel restyle pass.
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  // Honest play icon under reduced motion: `playing` is user intent, `motionOn`
  // is what actually moves (never, when reduced).
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const motionOn = playing && !reduced;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // load showcase per open
  useEffect(() => {
    if (!previewId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setErr(null);
    setEpochIdx(0);
    setPlaying(true);
    setLoaded({});
    setFailed({});
    view.current = { zoom: 1, pan: { x: 0, y: 0 } };
    kick();
    void getShowcase(previewId)
      .then((d) => { if (alive) setData(d.id === previewId ? d : null); })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => { alive = false; };
  }, [previewId, kick]);

  // lock body scroll + focus trap + esc while open; return focus on close
  useEffect(() => {
    if (!previewId) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePreview(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const vis = [...items].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!vis.length) return;
      const first = vis[0];
      const last = vis[vis.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
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

  // autoplay (still image when reduced motion or single frame) + visibility
  // pause: a hidden tab never advances frames
  useEffect(() => {
    if (!playing || n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setEpochIdx((i) => (i + 1) % n), 900);
    const onVis = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [playing, n]);
  // RAF cleanup: never leave a scheduled frame behind on close/unmount
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const step = useCallback((d: number) => {
    setPlaying(false);
    setEpochIdx((i) => (i + d + n) % n);
  }, [n]);

  // keyboard transport (outside text fields)
  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const tag = t.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
        || t.getAttribute?.('role') === 'combobox' || t.isContentEditable) return;
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

  // render: always-current draw (reads refs + latest props) scheduled through
  // `kick` — resize, arrival, preset, and gesture updates all funnel here
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewId) return;
    const host = canvas.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => kick());
    ro.observe(host);
    return () => ro.disconnect();
  }, [previewId, kick]);

  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas || !previewId) return;
      const host = canvas.parentElement;
      if (!host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const { zoom, pan } = view.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, w, h);
      if (curImg) {
        let sc = scratchRef.current;
        if (!sc) { sc = document.createElement('canvas'); scratchRef.current = sc; }
        if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
        const sctx = sc.getContext('2d', { willReadFrequently: true });
        if (sctx) {
          drawCover(sctx, curImg, w, h, pan, zoom);
          // restyle: fixed gentle asinh + chosen preset colormap
          try {
            const data = sctx.getImageData(0, 0, w, h);
            const px = data.data;
            for (let i = 0; i < px.length; i += 4) {
              const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
              let t = Math.min(1, Math.max(0, (lum - 0.05) / 0.93));
              t = applyStretch(t, 'asinh');
              const [r, g, b] = colormap(t, PRESET_CMAP[preset]);
              px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
            }
            sctx.putImageData(data, 0, 0);
          } catch { /* tainted canvas: show raw frame */ }
        }
        ctx.drawImage(sc, 0, 0, w, h);
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
    };
    kick();
  });

  // pan clamp: the frame may roam but never leave the stage entirely
  const clampPan = useCallback((x: number, y: number) => {
    const host = stageRef.current;
    const mx = host ? host.clientWidth * 0.75 : 480;
    const my = host ? host.clientHeight * 0.75 : 480;
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }, []);

  // non-passive wheel zoom (free range: zoom out past 100% welcome)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !previewId) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad pinch arrives as ctrl+wheel with fine deltas: scale smoothly.
      // Plain wheel steps a fixed notch. deltaY 0 = no-op (synthetic events).
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.003) : e.deltaY > 0 ? 0.92 : 1.09;
      if (factor === 1) return;
      view.current.zoom = Math.min(8, Math.max(0.2, view.current.zoom * factor));
      kick();
    };
    const onDbl = () => { view.current = { zoom: 1, pan: { x: 0, y: 0 } }; kick(); };
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDbl);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDbl);
    };
  }, [previewId, kick]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, pan: { ...view.current.pan }, moved: false };
    } else {
      drag.current = null; // multi-touch: pinch takes over
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: view.current.zoom,
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
        view.current.zoom = Math.min(8, Math.max(0.2, pinch.current.zoom * ratio));
      } else {
        pinch.current = { dist, zoom: view.current.zoom };
      }
      kick();
      return;
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
    else return;
    view.current.pan = clampPan(drag.current.pan.x + dx, drag.current.pan.y + dy);
    kick();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [, pt] = [...pointers.current.entries()][0];
      drag.current = { x: pt.x, y: pt.y, pan: { ...view.current.pan }, moved: true };
      return;
    }
    drag.current = null;
  };

  const goAdvanced = () => {
    if (!data) return;
    const id = data.id;
    closePreview();
    router.push(blinkURL(id, { band, epoch: idx }));
  };

  if (!previewId) return null;
  return (
    <div className="pv-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) closePreview(); }}>
      <div ref={panelRef} className="pv-panel glass" role="dialog" aria-modal="true"
        aria-label={data ? `Preview: ${data.title}` : 'Artifact preview'}>
        <button ref={closeRef} type="button" className="pv-close pressable" aria-label="Close preview"
          style={{ minWidth: 44, minHeight: 44 }}
          onClick={closePreview}>×</button>
        {!data && !err && <div className="pv-loading" aria-label="Loading preview"><span /></div>}
        {err && !data && (
          <div className="pv-status error">
            Couldn’t load this field: {err}.
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Link className="epoch-chip" href={`/blink/${encodeURIComponent(previewId)}`} onClick={closePreview}>
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
              <span className="viewer-tag mono">{cur?.label ?? '—'}</span>
              {n > 1 && (
                <div className="pv-transport" role="group" aria-label="Frame transport">
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }}
                    onClick={() => step(-1)} aria-label="Previous frame">‹</button>
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }}
                    onClick={() => setPlaying((p) => (n > 1 ? !p : p))}
                    aria-label={motionOn ? 'Pause' : 'Play'}>{motionOn ? '❚❚' : '▶'}</button>
                  <button type="button" className="icon-btn pressable" style={{ minWidth: 44, minHeight: 44 }}
                    onClick={() => step(1)} aria-label="Next frame">›</button>
                  <span className="mono pv-count" aria-live="off">{idx + 1}/{n}</span>
                </div>
              )}
            </div>
            <div className="pv-side">
              <p className="hero-kicker">{bandMeta?.label ?? ''} · {n} epoch{n === 1 ? '' : 's'}</p>
              <h2>{data.title}</h2>
              <p className="pv-story">{shortStory(data.story)}</p>
              <div className="pv-presets" role="group" aria-label="Viewing mode">
                {PRESETS.map((p) => (
                  <button
                    key={p.id} type="button"
                    className={`pv-preset${preset === p.id ? ' active' : ''}`}
                    aria-pressed={preset === p.id} title={p.hint}
                    onClick={() => setPreset(p.id)}
                  >
                    <span className="pv-sw" style={{ background: p.sw }} aria-hidden="true" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn primary pv-cta" onClick={goAdvanced}>
                Explore advanced analysis
              </button>
              <p className="fine">Full blink workspace: all modes, measure, spectra, exports.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
