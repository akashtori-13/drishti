'use client';

// Full BORESIGHT walk (Acts 1-2): live orbit -> click SPHEREx -> glitch tear
// -> home. Session flag `sh-entered` is set here for the Act 3 home deltas.
// Deep links (/sky, /blink/...) never mount this route.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrbitalIntro from './OrbitalIntro';
import GlitchTransition from './GlitchTransition';
import { getSwarmBundle, prepareSwarm, type PreparedSat } from '@/lib/orbit';

const EMPTY = { source: 'empty fallback', fetched_at: '', objects: [] };

export default function IntroExperience() {
  const router = useRouter();
  const [swarm, setSwarm] = useState<PreparedSat[] | null>(null);
  const [phase, setPhase] = useState<'orbit' | 'glitch'>('orbit');
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    void getSwarmBundle(EMPTY).then((b) => {
      if (alive) setSwarm(prepareSwarm(b));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!swarm) {
    return (
      <div className="orbital" role="status" aria-label="Acquiring orbital signal">
        <p className="orbital-hud mono">ACQUIRING SIGNAL · SPHEREx 63182…</p>
      </div>
    );
  }

  const enter = (f?: { x: number; y: number }) => {
    try {
      sessionStorage.setItem('sh-entered', '1');
    } catch {
      /* noop */
    }
    setSrc(document.querySelector('.orbital-sky') as HTMLCanvasElement | null);
    setFocus(f ?? null);
    setPhase('glitch');
  };

  return (
    <>
      {phase === 'orbit' && (
        <OrbitalIntro swarm={swarm} onEnter={enter} onSkip={() => router.push('/')} />
      )}
      {phase === 'glitch' && (
        <GlitchTransition source={src} focus={focus} onDone={() => router.push('/')} />
      )}
    </>
  );
}
