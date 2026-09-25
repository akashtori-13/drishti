'use client';

import { useEffect } from 'react';

/** Dismisses the server-rendered splash once the whole page has loaded. */
export default function SplashGate() {
  useEffect(() => {
    const el = document.getElementById('splash');
    if (!el) return;
    const t0 = performance.now();
    const MIN = 700;
    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, MIN - (performance.now() - t0));
      setTimeout(() => {
        el.classList.add('done');
        // hide, never remove: the node belongs to React's tree and
        // surgical removal desyncs reconciliation (breaks routing)
        setTimeout(() => { el.style.display = 'none'; }, 500);
      }, wait);
    };
    if (document.readyState === 'complete') dismiss();
    else {
      window.addEventListener('load', dismiss, { once: true });
      setTimeout(dismiss, 4000); // failsafe: never trap the user
    }
    return () => window.removeEventListener('load', dismiss);
  }, []);
  return null;
}
