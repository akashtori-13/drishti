'use client';

import { useEffect } from 'react';

/** Registers /sw.js once. Reloads only on updates (waiting/updatefound),
 *  never on first install. Disabled in dev via NEXT_PUBLIC_DISABLE_SW=1. */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_SW === '1') return;
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    const onUpdate = (reg: ServiceWorkerRegistration) => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        // Update ready only when a controller already exists (never first install).
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          window.location.reload();
        }
      });
    };
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          if (cancelled) return;
          // Update already waiting from a previous session (controller exists = update, not first install).
          if (reg.waiting && navigator.serviceWorker.controller) {
            window.location.reload();
            return;
          }
          reg.addEventListener('updatefound', () => onUpdate(reg));
        })
        .catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);
  return null;
}
