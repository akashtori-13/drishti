'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { Showcase } from '@/lib/showcases';

/** Rotating featured detections: real fields with ≥2 rendered cutouts.
 *  Currently parked (hero shows the data strip instead) — kept for repurposing. */
export function FeaturedCycle({ fields, consoleMode }: { fields: Showcase[]; consoleMode: boolean }) {
  const openPreview = useAppStore((s) => s.openPreview);
  const cands = useMemo(
    () => fields.filter((f) => f.epochs.filter((e) => e.png).length >= 2).slice(0, 5),
    [fields],
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  useEffect(() => {
    if (cands.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % cands.length), 6000);
    return () => clearInterval(t);
  }, [cands, paused]);
  if (!cands.length) return null;
  const f = cands[Math.min(i, cands.length - 1)];
  const pngs = f.epochs.map((e) => e.png).filter(Boolean) as string[];
  const mjds = f.epochs.map((e) => e.mjd).filter((m): m is number => m !== undefined);
  const span = mjds.length >= 2 ? Math.round(Math.abs(mjds[mjds.length - 1] - mjds[0])) : null;
  const swipe = (d: number) => {
    setPaused(true);
    setI((v) => (v + d + cands.length) % cands.length);
  };
  return (
    <div
      className="featured-wrap"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 40) return;
        swipe(dx < 0 ? 1 : -1);
      }}
    >
      <button
        key={f.id}
        type="button"
        onClick={() => openPreview(f.id)}
        className="featured"
        data-tilt="4"
        aria-label={`Featured real detection: ${f.title}`}
      >
        <span className="feat-imgs" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngs[0]} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngs[1]} alt="" draggable={false} className="b" />
        </span>
        <span className="feat-body">
          <span className="feat-k">{consoleMode ? 'Recent captures' : 'Real detection'}</span>
          <span className="feat-t">{f.title}</span>
          <span className="feat-s">
            Two SPHEREx visits{span !== null ? `, ${span} days apart` : ''}. The stars cancel out; the mover remains. →
          </span>
        </span>
      </button>
      {cands.length > 1 && (
        <div className="feat-dots" role="group" aria-label="Featured fields">
          {cands.map((c, k) => (
            <button
              key={c.id} type="button" aria-label={`Show ${c.title}`}
              aria-pressed={k === Math.min(i, cands.length - 1)}
              className={`feat-dot${k === Math.min(i, cands.length - 1) ? ' active' : ''}`}
              onClick={() => { setI(k); setPaused(true); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
