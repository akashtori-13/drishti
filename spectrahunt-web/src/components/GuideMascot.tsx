'use client';

import { useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';

/** Pip — original alien mascot, inline SVG (no external asset).
 *  Decorative by default (adjacent text names it); set labelled for standalone use. */
export function PipArt({ size = 56, asleep = false, labelled = false }: { size?: number; asleep?: boolean; labelled?: boolean }) {
  const gradId = useId();
  const [motion, setMotion] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const apply = () => setMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} aria-label={labelled ? (asleep ? 'Pip the alien guide, resting' : 'Pip the alien guide') : undefined}>
      {/* antenna */}
      <line x1="32" y1="10" x2="32" y2="4" stroke="#8a90ab" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="4" r="2.4" fill="#7df0c8" className="pip-blink">
        {motion && <animate attributeName="opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      {/* head */}
      <ellipse cx="32" cy="26" rx="20" ry="17" fill="#3ddc97" />
      <ellipse cx="32" cy="26" rx="20" ry="17" fill={`url(#${gradId})`} opacity="0.25" />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#06281c" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* eyes: open ovals, or resting curves */}
      {asleep ? (
        <g stroke="#0b1020" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M18 25 Q24 28 30 25" />
          <path d="M34 25 Q40 28 46 25" />
        </g>
      ) : (
        <g>
          <ellipse cx="24" cy="25" rx="6" ry="7.5" fill="#0b1020" />
          <ellipse cx="40" cy="25" rx="6" ry="7.5" fill="#0b1020" />
          <circle cx="26" cy="22.5" r="2" fill="#ffffff" />
          <circle cx="42" cy="22.5" r="2" fill="#ffffff" />
        </g>
      )}
      {/* cheeks + smile */}
      <circle cx="19" cy="31" r="2.4" fill="#ff9db0" opacity="0.8" />
      <circle cx="45" cy="31" r="2.4" fill="#ff9db0" opacity="0.8" />
      <path d="M27 33 Q32 37 37 33" stroke="#0b1020" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* body */}
      <ellipse cx="32" cy="50" rx="11" ry="8" fill="#2bb57e" />
      <circle cx="28" cy="50" r="1.6" fill="#d8ffe9" />
      <circle cx="32.5" cy="51.5" r="1.6" fill="#d8ffe9" />
      <circle cx="36" cy="49" r="1.6" fill="#d8ffe9" />
    </svg>
  );
}

/** Parked friendly button: gentle bob, wave on first sight, dot when Pip
 *  has something (unread first-visit blink greeting). Never roams. */
export default function GuideMascot() {
  const pathname = usePathname();
  const enabled = useAppStore((s) => s.guideEnabled);
  const open = useAppStore((s) => s.guideOpen);
  const setOpen = useAppStore((s) => s.setGuideOpen);
  const showcase = useAppStore((s) => s.guideShowcase);
  const seen = useAppStore((s) => s.guideBlinkSeen);
  const [waved] = useState<boolean>(() => {
    // Session-only wave gate, decided at first render (no effect setState).
    if (typeof window === 'undefined') return true;
    try {
      if (sessionStorage.getItem('pip-waved')) return true;
      sessionStorage.setItem('pip-waved', '1');
      return false;
    } catch { return true; }
  });

  if (!enabled) return null;
  const dot = !open && pathname.startsWith('/blink') && !!showcase && !seen.includes(showcase.id);
  return (
    <button
      type="button"
      id="pip-fab"
      className={`guide-fab${open ? ' is-asleep' : ''}${waved ? '' : ' is-waving'}`}
      aria-label={open ? 'Close guide' : dot ? 'Open guide — Pip has a note for this field' : 'Open guide (Pip)'}
      aria-expanded={open}
      aria-controls="guide-panel"
      aria-haspopup="dialog"
      onClick={() => setOpen(!open)}
    >
      <PipArt asleep={open} />
      {dot && <span className="guide-dot" aria-hidden="true" />}
    </button>
  );
}
