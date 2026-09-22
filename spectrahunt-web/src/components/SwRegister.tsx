'use client';

import { useEffect } from 'react';

/** Registers /sw.js once. Disabled in dev via NEXT_PUBLIC_DISABLE_SW=1. */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_SW === '1') return;
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;
    const onController = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onController);
  }, []);
  return null;
}
