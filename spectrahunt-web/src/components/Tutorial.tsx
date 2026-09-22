'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';

const STEPS = [
  { h: 'SPHEREx photographs the whole sky every ~6 months', p: '102 infrared colors, 0.75–5 µm. Same sky, different time — that is the time machine.' },
  { h: 'Pick a field and press Play', p: 'Search an object, click the sky, or hit Surprise me. The timeline scrubs through every visit.' },
  { h: 'Flip on Difference to catch movers', p: 'Stationary stars cancel to gray. A mover leaves a bright + dark pair: where it is, and where it was.' },
  { h: 'Check the candidate, share the link', p: 'Known asteroid? Variable star? Unidentified? Copy the URL — it encodes position, band, epoch, and mode.' },
];

export default function Tutorial() {
  const { tutorialDone, setTutorialDone } = useAppStore();
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  // Render nothing during SSR and hydration: tutorialDone is seeded from
  // localStorage, which the server never sees — a returning visitor would
  // hydrate `null` over server-rendered dialog markup (hydration mismatch).
  if (!mounted || tutorialDone) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Quick tutorial"
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(4,5,10,.72)', padding: 20 }}>
      <div className="glass" style={{ maxWidth: 480, width: '100%', borderRadius: 20, padding: 28 }}>
        <p style={{ fontSize: 12, color: '#8a90ab' }}>Step {i + 1} of {STEPS.length} · first visit guide</p>
        <h2 style={{ fontSize: 22, margin: '8px 0', letterSpacing: '-.02em' }}>{STEPS[i].h}</h2>
        <p style={{ color: '#aab0c8', lineHeight: 1.6 }}>{STEPS[i].p}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Back</button>}
          {i < STEPS.length - 1
            ? <button type="button" className="btn primary" onClick={() => setI(i + 1)}>Next</button>
            : <button type="button" className="btn primary" onClick={() => setTutorialDone(true)}>Start hunting</button>}
          <button type="button" className="btn" onClick={() => setTutorialDone(true)} style={{ marginLeft: 'auto' }}>Skip</button>
        </div>
      </div>
    </div>
  );
}
