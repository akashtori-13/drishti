'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Tutorial from '@/components/Tutorial';

/** Site chrome: nav + footer on every real page (footer hidden on fullscreen sky). */
export default function SiteChrome({ children, showTutorial = false }: { children: React.ReactNode; showTutorial?: boolean }) {
  const pathname = usePathname();
  const isSky = pathname === '/sky';
  return (
    <div className="flex flex-col min-h-screen">
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      {showTutorial && <Tutorial />}
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      {!isSky && (
        <footer className="site-foot">
          <div className="foot-inner">
            <div className="foot-brand">
              <span className="brand-name">SpectraHunt</span>
              <p className="foot-note">A public blink comparator for the SPHEREx sky. NASA Space Apps Challenge 2026.</p>
            </div>
            <p className="foot-cite">Data: NASA/JPL–Caltech SPHEREx, processed by IRSA (IPAC). DOI 10.26131/IRSA652.</p>
          </div>
        </footer>
      )}
    </div>
  );
}
