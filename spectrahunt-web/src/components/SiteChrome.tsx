'use client';

import Link from 'next/link';
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
              <span className="brand-name">STELLAR</span>
              <p className="foot-note">A public blink comparator for the SPHEREx sky. NASA Space Apps Challenge 2026.</p>
            </div>
            <nav className="foot-cols" aria-label="Footer">
              <div className="foot-col">
                <span className="foot-h">Explore</span>
                <Link href="/sky">Sky map</Link>
                <Link href="/candidates">Candidates</Link>
                <Link href="/blink/3i-atlas">3I/ATLAS blink</Link>
              </div>
              <div className="foot-col">
                <span className="foot-h">Learn</span>
                <Link href="/about">About + tours</Link>
                <Link href="/#how">How it works</Link>
                <Link href="/#fields">Fields</Link>
              </div>
              <div className="foot-col">
                <span className="foot-h">Data</span>
                <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">IRSA archive</a>
                <a href="https://doi.org/10.26131/IRSA652" target="_blank" rel="noreferrer">DOI 10.26131/IRSA652</a>
              </div>
            </nav>
          </div>
          <p className="foot-cite">Data: NASA/JPL–Caltech SPHEREx, processed by IRSA (IPAC). DOI 10.26131/IRSA652.</p>
        </footer>
      )}
    </div>
  );
}
