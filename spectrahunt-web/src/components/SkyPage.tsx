'use client';

import { useEffect, useState } from 'react';
import AladinSky from '@/components/AladinSky';
import { useAppStore } from '@/lib/store';

function coordsFromHash(): { ra: number; dec: number } | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/[#&?]ra=(-?\d+\.?\d*).*?dec=(-?\d+\.?\d*)/);
  if (!m) return null;
  const ra = parseFloat(m[1]);
  const dec = parseFloat(m[2]);
  if (Number.isNaN(ra) || Number.isNaN(dec)) return null;
  return { ra, dec };
}

export default function SkyPage() {
  const { openShowcase } = useAppStore();
  const [pos, setPos] = useState({ ra: 252.6633, dec: -17.4904 });

  useEffect(() => {
    const apply = () => {
      const hit = coordsFromHash();
      if (hit) setPos(hit);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Sky context</h1>
          <p className="text-slate-400">Aladin Lite view (DSS2 color) with target marker. Pan and zoom freely.</p>
        </div>
        <AladinSky ra={pos.ra} dec={pos.dec} fov={1.0} />
        <div className="flex flex-wrap gap-2 text-sm">
          <button onClick={() => openShowcase('3i-atlas')} className="px-3 py-1.5 rounded-full border border-slate-700 text-slate-200">Blink 3I/ATLAS →</button>
          <a className="px-3 py-1.5 rounded-full border border-slate-700 text-blue-300" target="_blank" rel="noreferrer"
            href={`https://irsa.ipac.caltech.edu/irsaviewer/?pos=${pos.ra},${pos.dec}`}>
            Open in IRSA Viewer →
          </a>
          <a className="px-3 py-1.5 rounded-full border border-slate-700 text-blue-300" target="_blank" rel="noreferrer"
            href="https://minorplanetcenter.net/cgi-bin/checkmp.cgi">MPC checker →</a>
        </div>
      </div>
    </div>
  );
}
