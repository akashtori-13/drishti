'use client';

// Full BORESIGHT walk (Acts 1-2): live orbit -> click SPHEREx -> glitch tear
// -> home. Session flag `sh-entered` is set here for the Act 3 home deltas.
// Deep links (/sky, /blink/...) never mount this route.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrbitalIntro from './OrbitalIntro';
import GlitchTransition from './GlitchTransition';
import { getSwarmBundle, prepareSwarm, type PreparedSat, type SwarmBundle } from '@/lib/orbit';
import FALLBACK from '@/lib/tle-bundle.fallback.json';

const fallback = FALLBACK as SwarmBundle;

export default function IntroExperience() {
  const router = useRouter();
  const [swarm, setSwarm] = useState<PreparedSat[] | null>(null);
  const [phase, setPhase] = useState<'orbit' | 'glitch'>('orbit');
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    void getSwarmBundle(fallback).then((b) => {
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

  // Passing the gate (enter or skip) marks entry so Home never bounces.
  // localStorage (not session): mobile OSes kill background tabs and wipe
  // session storage, which used to replay the intro "sometimes".
  const pass = () => {
    try {
      localStorage.setItem('sh-entered-v1', '1');
      sessionStorage.setItem('sh-entered', '1');
    } catch {
      /* noop */
    }
  };

  const enter = (f?: { x: number; y: number }) => {
    pass();
    setSrc(document.querySelector('.orbital-sky') as HTMLCanvasElement | null);
    setFocus(f ?? null);
    setPhase('glitch');
  };

  const skip = () => {
    pass();
    router.push('/');
  };

  return (
    <>
      {phase === 'orbit' && (
        <OrbitalIntro swarm={swarm} onEnter={enter} onSkip={skip} />
      )}
      {phase === 'glitch' && (
        <GlitchTransition source={src} focus={focus} onDone={() => router.push('/')} />
      )}
    </>
  );
}
