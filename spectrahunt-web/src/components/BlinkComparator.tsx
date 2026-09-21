'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface BlinkEpoch {
  label: string;
  png?: string | null;
  note?: string;
}

export default function BlinkComparator({ before, after }: { before: BlinkEpoch; after: BlinkEpoch }) {
  const [pos, setPos] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<'slider' | 'onion' | 'diff'>('slider');
  const trackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setPos((p) => (p > 0.5 ? 0 : 1));
    }, 900);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const onPointer = useCallback((e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    setPos(x);
  }, []);

  const frame = (e: BlinkEpoch, tint: string) => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: tint }}>
      {e.png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.png} alt={e.label} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="text-center px-6">
          <div className="text-5xl mb-3">✦</div>
          <div className="font-semibold text-white">{e.label}</div>
          <div className="text-xs text-slate-300 mt-2 max-w-sm">
            Live cutout loads via IRSA IBE when online. Offline you still get the story + metadata below.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex gap-2 mb-3 text-sm">
        {(['slider', 'onion', 'diff'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-full border ${mode === m ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-700 text-slate-300'}`}>
            {m === 'slider' ? 'Slider' : m === 'onion' ? 'Onion-skin' : 'A−B'}
          </button>
        ))}
        <button onClick={() => setPlaying((p) => !p)}
          className="ml-auto px-3 py-1 rounded-full border border-slate-700 text-slate-200">
          {playing ? '⏸ Pause' : '▶ Blink'}
        </button>
      </div>

      <div ref={trackRef} onPointerDown={onPointer} onPointerMove={(e) => e.buttons && onPointer(e)}
        className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-700 select-none cursor-ew-resize bg-slate-900">
        {mode === 'slider' && (
          <>
            {frame(before, 'radial-gradient(circle at 30% 30%, #1e2a5a, #05060c)')}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}>
              {frame(after, 'radial-gradient(circle at 70% 30%, #5a2a1e, #05060c)')}
            </div>
            <div className="absolute top-0 bottom-0" style={{ left: `${pos * 100}%` }}>
              <div className="w-0.5 h-full bg-white/80" />
            </div>
          </>
        )}
        {mode === 'onion' && (
          <>
            {frame(before, 'radial-gradient(circle at 30% 30%, #1e2a5a, #05060c)')}
            <div className="absolute inset-0" style={{ opacity: pos }}>
              {frame(after, 'radial-gradient(circle at 70% 30%, #5a2a1e, #05060c)')}
            </div>
          </>
        )}
        {mode === 'diff' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,#0b0d18,#0b0d18_12px,#101423_12px,#101423_24px)]">
            <div className="text-center text-slate-300 text-sm px-6">
              A−B difference is computed in the pipeline (reproject + zodi-subtract + SEP). Live diff PNGs appear here once cached.
            </div>
          </div>
        )}
        <div className="absolute top-2 left-2 text-[11px] bg-black/60 px-2 py-1 rounded">A · {before.label}</div>
        <div className="absolute top-2 right-2 text-[11px] bg-black/60 px-2 py-1 rounded">B · {after.label}</div>
      </div>

      <input type="range" min={0} max={1000} value={Math.round(pos * 1000)}
        onChange={(e) => setPos(Number(e.target.value) / 1000)} className="w-full mt-3" aria-label="Blink position" />
    </div>
  );
}
