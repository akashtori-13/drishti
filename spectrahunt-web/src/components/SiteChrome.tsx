'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import Tutorial from '@/components/Tutorial';
import SpaceBackdrop from '@/components/SpaceBackdrop';
import ArtifactPreview from '@/components/ArtifactPreview';
import { useAppStore } from '@/lib/store';

/** Site chrome: nav + footer on every real page (footer hidden on fullscreen sky). */
export default function SiteChrome({ children, showTutorial = false }: { children: React.ReactNode; showTutorial?: boolean }) {
  const pathname = usePathname();
  const openPreview = useAppStore((s) => s.openPreview);
  const isSky = pathname === '/sky';
  return (
    <div className="flex flex-col min-h-screen relative">
      <a className="skip" href="#main">Skip to content</a>
      <SpaceBackdrop />
      <Header />
      {showTutorial && <Tutorial />}
      <ArtifactPreview />
      <main id="main" tabIndex={-1} className="flex-1">
        <div key={pathname} className="xfade xfade-route">
          {children}
        </div>
      </main>
      {!isSky && (
        <footer className="site-foot">
          <div className="foot-inner">
            <div className="foot-brand">
              <span className="brand-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="logo" className="logo icon" />
                <span className="brand-name">STELLAR</span>
              </span>
              <p className="foot-note">A public blink comparator for the SPHEREx sky. NASA Space Apps Challenge 2026.</p>
            </div>
            <nav className="foot-cols" aria-label="Footer">
              <div className="foot-col">
                <span className="foot-h">Explore</span>
                <Link href="/sky">SkyMap</Link>
                <Link href="/candidates">Featured</Link>
                <button type="button" className="linklike" onClick={() => openPreview('3i-atlas')}>3I/ATLAS blink</button>
              </div>
              <div className="foot-col">
                <span className="foot-h">Learn</span>
                <Link href="/mission">Mission + tours</Link>
                <Link href="/about">Team</Link>
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
