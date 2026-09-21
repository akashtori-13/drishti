'use client';

import { useEffect, useState } from 'react';
import BlinkComparator from '@/components/BlinkComparator';
import AladinSky from '@/components/AladinSky';
import { SHOWCASE_IDS, getShowcase, type Showcase } from '@/lib/showcases';
import { useAppStore } from '@/lib/store';

export default function BlinkPage() {
  const { showcaseId, openShowcase } = useAppStore();
  const [data, setData] = useState<Showcase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const viewing = data && data.id === showcaseId ? data : null;

  useEffect(() => {
    let alive = true;
    getShowcase(showcaseId)
      .then((d) => { if (alive) { setData(d); setErr(null); } })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [showcaseId]);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">Blink comparator</h1>
        <p className="text-slate-400 mb-4">Same sky, different time. Drag, onion-skin, or auto-blink.</p>

        <div className="flex flex-wrap gap-2 mb-6">
          {SHOWCASE_IDS.map((s) => (
            <button key={s} onClick={() => openShowcase(s)}
              className={`px-3 py-1.5 rounded-full text-sm border ${showcaseId === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-700 text-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>

        {err && <div className="bg-red-500/10 border border-red-500 text-red-300 px-4 py-3 rounded-lg">Failed to load {showcaseId}: {err}</div>}
        {!viewing && !err && <div className="text-slate-400">Loading {showcaseId}…</div>}

        {viewing && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">{viewing.title}</h2>
              <p className="text-slate-300 mt-1">{viewing.story}</p>
            </div>
            <BlinkComparator
              before={{ label: viewing.epochs[0]?.label ?? 'A', png: viewing.epochs[0]?.png, note: viewing.epochs[0]?.note }}
              after={{ label: viewing.epochs[1]?.label ?? 'B', png: viewing.epochs[1]?.png, note: viewing.epochs[1]?.note }}
            />
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              {viewing.epochs.map((e, i) => (
                <div key={i} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
                  <div className="font-semibold mb-1">Epoch {i === 0 ? 'A' : 'B'} · {e.label}</div>
                  <div className="text-slate-400 font-mono text-xs space-y-1">
                    {e.obs_id && <div>obs {e.obs_id}</div>}
                    {e.band && <div>band D{e.band} · λ≈{e.wavelength_um}µm · same-band blink only</div>}
                    {e.mjd && <div>MJD {e.mjd}</div>}
                    {e.note && <div className="text-slate-300">{e.note}</div>}
                  </div>
                </div>
              ))}
            </div>
            <AladinSky ra={viewing.ra} dec={viewing.dec} fov={0.5} />
            {viewing.links && (
              <div className="flex flex-wrap gap-3 text-sm">
                {Object.entries(viewing.links).map(([k, v]) => (
                  <a key={k} href={v} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">→ {k}</a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
