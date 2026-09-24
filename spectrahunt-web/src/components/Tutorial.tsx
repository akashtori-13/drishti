'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const fadeTimer = useRef<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  // Fade the panel in on mount (symmetric with step fades below).
  useEffect(() => {
    if (!mounted || tutorialDone) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted, tutorialDone]);
  // Focus management: take focus on open, trap Tab inside, return on close.
  useEffect(() => {
    if (!mounted || tutorialDone) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTutorialDone(true);
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const els = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try {
        if (prevFocus.current && document.contains(prevFocus.current)) {
          prevFocus.current.focus({ preventScroll: true });
        }
      } catch {
        /* noop */
      }
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, [mounted, tutorialDone, setTutorialDone]);
  // Render nothing during SSR and hydration: tutorialDone is seeded from
  // localStorage, which the server never sees — a returning visitor would
  // hydrate `null` over server-rendered dialog markup (hydration mismatch).
  if (!mounted || tutorialDone) return null;
  const go = (next: number) => {
    if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    setShown(false);
    fadeTimer.current = window.setTimeout(() => {
      setI(next);
      requestAnimationFrame(() => setShown(true));
    }, 160);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Quick tutorial"
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(4,5,10,.72)', padding: 20 }}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="glass"
        style={{ position: 'relative', maxWidth: 480, width: '100%', borderRadius: 20, padding: 28, outline: 'none' }}
      >
        <button type="button" onClick={() => setTutorialDone(true)} aria-label="Skip tutorial"
          style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 0, padding: '6px 8px', fontSize: 12, color: '#8a90ab', cursor: 'pointer' }}>
          Skip
        </button>
        <div
          key={i}
          className="xfade"
          style={{
            opacity: shown ? 1 : 0,
            transition: 'opacity var(--dur-ui, 220ms) var(--ease-out, cubic-bezier(.23,1,.32,1))',
          }}
        >
          <p style={{ fontSize: 12, color: '#8a90ab' }}>Step {i + 1} of {STEPS.length} · first visit guide</p>
          <h2 style={{ fontSize: 22, margin: '8px 0', letterSpacing: '-.02em' }}>{STEPS[i].h}</h2>
          <p style={{ color: '#aab0c8', lineHeight: 1.6 }}>{STEPS[i].p}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {i > 0
            ? <button type="button" className="btn" onClick={() => go(i - 1)}>Back</button>
            : <span />}
          {i < STEPS.length - 1
            ? <button type="button" className="btn primary" onClick={() => go(i + 1)} style={{ marginLeft: 'auto' }}>Next</button>
            : <button type="button" className="btn primary" onClick={() => setTutorialDone(true)} style={{ marginLeft: 'auto' }}>Start hunting</button>}
        </div>
      </div>
    </div>
  );
}
