'use client';

import { useEffect } from 'react';
import { useAppStore, type View } from '@/lib/store';
import Header from '@/components/Header';
import HomePage from '@/components/HomePage';
import BlinkPage from '@/components/BlinkPage';
import SkyPage from '@/components/SkyPage';
import CandidatesPage from '@/components/CandidatesPage';
import AboutPage from '@/components/AboutPage';

const TITLES: Record<View, string> = {
  home: 'SpectraHunt: hunt what moves in the infrared sky',
  blink: 'Blink — SpectraHunt',
  sky: 'Sky map — SpectraHunt',
  candidates: 'Candidates — SpectraHunt',
  about: 'About — SpectraHunt',
};

export default function Home() {
  const { currentView, openShowcase } = useAppStore();

  useEffect(() => {
    let first = true;
    const apply = () => {
      const raw = window.location.hash.replace(/^#\/?/, '');
      if (raw === 'how') {
        useAppStore.getState().setCurrentView('home');
        requestAnimationFrame(() => document.getElementById('how')?.scrollIntoView({ block: 'start' }));
        return;
      }
      const seg = raw.split(/[?/]/)[0];
      const s = useAppStore.getState();
      if (seg.startsWith('blink/')) {
        openShowcase(seg.replace('blink/', '').split('?')[0] || '3i-atlas');
      } else if (seg === 'blink') {
        s.setCurrentView('blink');
      } else if (seg === 'sky') {
        s.setCurrentView('sky');
      } else if (seg === 'candidates') {
        s.setCurrentView('candidates');
      } else if (seg === 'about') {
        s.setCurrentView('about');
      } else {
        s.setCurrentView('home');
      }
      if (!first) {
        window.scrollTo({ top: 0 });
        document.getElementById('main')?.focus({ preventScroll: true });
      }
      first = false;
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [openShowcase]);

  useEffect(() => {
    document.body.dataset.view = currentView;
    document.title = TITLES[currentView];
  }, [currentView]);

  return (
    <div className="flex flex-col min-h-screen">
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1">
        <div className={`view${currentView === 'home' ? ' active' : ''}`}>
          {currentView === 'home' && <HomePage />}
        </div>
        {currentView === 'blink' && <BlinkPage />}
        {currentView === 'sky' && <SkyPage />}
        {currentView === 'candidates' && <CandidatesPage />}
        {currentView === 'about' && <AboutPage />}
      </main>
      <footer className="site-foot">
        <div className="foot-inner">
          <div className="foot-brand">
            <span className="brand-name">SpectraHunt</span>
            <p className="foot-note">A public blink comparator for the SPHEREx sky. NASA Space Apps Challenge 2026.</p>
          </div>
          <p className="foot-cite">Data: NASA/JPL–Caltech SPHEREx, processed by IRSA (IPAC). DOI 10.26131/IRSA652.</p>
        </div>
      </footer>
    </div>
  );
}
