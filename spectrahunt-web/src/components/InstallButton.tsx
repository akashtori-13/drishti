'use client';

import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install app" chip: visible only while the browser offers installation. */
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (installed || !deferred) return null;
  return (
    <button
      type="button" className="chip"
      onClick={() => {
        void (async () => {
          try {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            // Keep the deferred prompt until the user accepts, so a
            // dismissal leaves the install affordance available.
            if (choice?.outcome === 'accepted') setDeferred(null);
          } catch {
            /* keep deferred for retry */
          }
        })();
      }}
    >
      Install app
    </button>
  );
}
