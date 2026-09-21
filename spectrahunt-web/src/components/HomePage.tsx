'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { SHOWCASE_IDS, resolveQuery } from '@/lib/showcases';
import { ArrowRight, Search } from 'lucide-react';

const CARDS: Record<string, { blurb: string; meta: string }> = {
  '3i-atlas': { blurb: 'Interstellar comet: quiet in August, erupting in December.', meta: 'D3 · λ≈2.02µm · 4 months apart' },
  'ecliptic-mover': { blurb: 'Main-belt asteroid ground: blink same-band epochs.', meta: 'D3 · ecliptic plane' },
  'nep-deep': { blurb: 'Hundreds of visits per channel. Stack deep, blink for variables.', meta: 'D4 · deep field' },
};

export default function HomePage() {
  const { openShowcase, setCurrentView } = useAppStore();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const go = async () => {
    const hit = await resolveQuery(q.trim());
    if (!hit) { setMsg('Try "RA, Dec" — e.g. 252.6633, -17.4904'); return; }
    setMsg(null);
    setCurrentView('sky');
    window.location.hash = `#/sky?ra=${hit.ra}&dec=${hit.dec}`;
  };

  return (
    <div className="min-h-screen">
      <section className="relative py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-block text-xs tracking-widest text-yellow-300/90 border border-slate-700 rounded-full px-4 py-1.5 mb-5">
            SPHEREx QR2 · 102 COLORS · ALL-SKY EVERY 6 MONTHS
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Hunt what moves
          </h1>
          <p className="text-lg text-slate-300 mb-8">
            SPHEREx maps the whole sky in the infrared. Comets, asteroids and variable
            stars give themselves away by shifting between visits — blink the epochs and see.
          </p>

          <div className="relative max-w-xl mx-auto mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="Jump to coordinates — RA, Dec"
              className="w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {msg && <div className="text-sm text-yellow-300 mb-2">{msg}</div>}

          <div className="grid sm:grid-cols-3 gap-4 mt-8 text-left">
            {SHOWCASE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => openShowcase(id)}
                className="p-5 bg-slate-800/40 border border-slate-700/60 rounded-2xl hover:border-purple-500/60 transition-all text-left"
              >
                <div className="font-mono text-xs text-purple-300 mb-1">{id}</div>
                <div className="font-semibold mb-1">{CARDS[id].blurb}</div>
                <div className="text-xs text-slate-400 mb-3">{CARDS[id].meta}</div>
                <span className="inline-flex items-center text-sm text-blue-300">
                  Blink it <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            ['1 · Pick a patch', 'Curated showcases or any RA/Dec. Same band only — the LVF rule.'],
            ['2 · Blink epochs', 'Slider, onion-skin, or autoplay. Movers pop against static stars.'],
            ['3 · Verify', 'Aladin context, IRSA Viewer deep-link, SkyBoT/MPC cross-check.'],
          ].map(([h, p]) => (
            <div key={h} className="p-6 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
              <h3 className="font-semibold mb-2">{h}</h3>
              <p className="text-sm text-slate-400">{p}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
