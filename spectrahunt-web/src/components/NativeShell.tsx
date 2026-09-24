'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

/**
 * Native-shell adapter. No-op on plain web.
 * - Capacitor (Android): _blank links open in the system browser, hardware
 *   back walks app history instead of exiting.
 * - Tauri (desktop): _blank links open via the opener plugin.
 */
export default function NativeShell() {
  const router = useRouter();
  useEffect(() => {
    const isCapacitor = Capacitor.isNativePlatform();
    const isTauri = (window as unknown as { __TAURI__?: unknown }).__TAURI__ != null;
    if (!isCapacitor && !isTauri) return;
    let alive = true;

    const openExternal = (url: string) => {
      if (isCapacitor) {
        void import('@capacitor/browser').then(({ Browser }) => {
          if (alive) void Browser.open({ url });
        }).catch(() => { window.location.href = url; });
      } else {
        void import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
          if (alive) void openUrl(url).catch(() => { window.location.href = url; });
        }).catch(() => { window.location.href = url; });
      }
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!a?.href || !a.href.startsWith('http')) return;
      e.preventDefault();
      openExternal(a.href);
    };
    document.addEventListener('click', onClick);

    let backSub: { remove: () => void } | null = null;
    if (isCapacitor) {
      void import('@capacitor/app').then(({ App }) => {
        if (!alive) return;
        void App.addListener('backButton', () => {
          if (window.history.length > 1) router.back();
          else void App.minimizeApp();
        }).then((sub) => { backSub = sub; });
      }).catch(() => undefined);
    }
    return () => {
      alive = false;
      document.removeEventListener('click', onClick);
      backSub?.remove();
    };
  }, [router]);
  return null;
}
