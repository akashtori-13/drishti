'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { BANDS } from '@/lib/sky';

export interface BlinkFrame {
  label: string;
  png?: string | null;
  note?: string;
  obs_id?: string;
  mjd?: number;
}

/**
 * Epoch blink player: autoplay transport, speed, step, difference mode,
 * band selector, epoch chips, keyboard. PNG layers when cached, styled
 * fallback placeholders offline.
 */
export default function BlinkComparator({
  frames, band, onBandChange, title,
}: {
  frames: BlinkFrame[]; band: number; onBandChange: (b: number) => void; title: string;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(550);
  const [diff, setDiff] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = frames.length;
  const cur = frames[Math.min(idx, n - 1)];

  useEffect(() => {
    if (!playing || n < 2) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % n), speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, n]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    setIdx((i) => (i + d + n) % n);
  }, [n]);

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

  const bandMeta = BANDS[band - 1];

  return (
    <div className="viewer">
      <div className="viewer-stage">
        {cur?.png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cur.png} alt={`${title} — ${cur.label}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            draggable={false}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 50% 40%, #1a2145, #04050a 70%)',
          }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
              <div style={{ fontWeight: 600, color: '#fff' }}>{cur?.label ?? '—'}</div>
              <div style={{ fontSize: 12, color: '#aab0c8', marginTop: 8, maxWidth: 340 }}>
                {diff
                  ? 'Difference frame renders once the cutout pipeline caches this field.'
                  : 'Cutout PNG loads via IRSA IBE when the indexer runs. Story + metadata below work offline.'}
              </div>
            </div>
          </div>
        )}
        <span className="viewer-tag mono">{diff ? 'Difference mode' : 'Raw frames'}</span>
        <span className="viewer-tag epoch mono">{cur?.label ?? '—'}</span>
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
        <div className="diff-row">
          <span id="diffLabel">Difference mode cancels stationary stars and keeps the mover</span>
          <button
            type="button" className="switch" role="switch" aria-checked={diff}
            aria-labelledby="diffLabel" onClick={() => setDiff((d) => !d)}
          />
        </div>
        <p className="keys"><kbd>Space</kbd> play or pause &nbsp; <kbd>←</kbd> <kbd>→</kbd> step through epochs</p>
      </div>

      <div className="band-row">
        {BANDS.map((b) => (
          <button
            key={b.id} type="button" className="band"
            style={{ ['--band-color' as string]: b.color }}
            aria-pressed={b.id === band}
            onClick={() => onBandChange(b.id)}
          >
            <span className="sw" style={{ background: b.color }} />{b.label}
          </button>
        ))}
      </div>
      <div className="band-row" style={{ paddingTop: 0 }}>
        {frames.map((f, i) => (
          <button
            key={f.label} type="button" className="epoch-chip"
            aria-pressed={i === idx}
            onClick={() => { setPlaying(false); setIdx(i); }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="band-row" style={{ paddingTop: 0 }}>
        <span style={{ fontSize: 12, color: '#8a90ab' }}>
          {bandMeta.label} ({bandMeta.range}) · same-band blink only
        </span>
      </div>
    </div>
  );
}
