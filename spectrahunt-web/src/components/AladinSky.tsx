'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window { A?: AladinGlobal }
}

interface AladinInstance {
  setImageSurvey: (s: string) => void;
  addCatalog: (c: unknown) => void;
}

interface AladinGlobal {
  init: Promise<void>;
  aladin: (el: HTMLElement, opts: Record<string, unknown>) => AladinInstance;
  catalogFromPositions: (pos: Array<{ ra: number; dec: number }>, opts: Record<string, unknown>) => unknown;
}

/** Aladin Lite v3 sky context: HiPS + grid + marker. Client-only, CDN script. */
export default function AladinSky({ ra, dec, fov = 0.5 }: { ra: number; dec: number; fov?: number }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('loading Aladin Lite…');

  useEffect(() => {
    let cancelled = false;
    const init = () => {
      try {
        if (!window.A || !divRef.current) { setStatus('Aladin CDN blocked — coordinates still work below.'); return; }
        window.A.init.then(() => {
          if (cancelled || !window.A || !divRef.current) return;
          const aladin = window.A.aladin(divRef.current, {
            target: `${ra} ${dec}`, fov, cooFrame: 'ICRS',
            showCooGrid: true, showReticle: true,
          });
          aladin.setImageSurvey('P/DSS2/color');
          aladin.addCatalog(window.A.catalogFromPositions(
            [{ ra, dec }], { name: 'target', color: '#ff5252', shape: 'circle', size: 12 }));
          setStatus('');
        }).catch(() => { if (!cancelled) setStatus('Aladin failed to init — coordinates still work below.'); });
      } catch {
        setStatus('Aladin failed to init — coordinates still work below.');
      }
    };
    if (!document.querySelector('script[data-aladin]')) {
      const s = document.createElement('script');
      s.src = 'https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js';
      s.async = true;
      s.dataset.aladin = '1';
      s.onload = init;
      s.onerror = () => setStatus('Aladin CDN blocked — coordinates still work below.');
      document.head.appendChild(s);
    } else if (window.A) {
      init();
    } else {
      const t = setInterval(() => { if (window.A) { clearInterval(t); init(); } }, 300);
      setTimeout(() => clearInterval(t), 8000);
    }
    return () => { cancelled = true; };
  }, [ra, dec, fov]);

  return (
    <div>
      <div ref={divRef} className="w-full aspect-video rounded-xl overflow-hidden border border-slate-700 bg-slate-900" />
      {status && <div className="text-xs text-slate-400 mt-2">{status}</div>}
      <div className="text-xs text-slate-400 mt-2 font-mono">RA {ra.toFixed(4)}° · Dec {dec.toFixed(4)}° · DSS2 color via Aladin Lite</div>
    </div>
  );
}
