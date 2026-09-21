'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import Header from '@/components/Header';
import HomePage from '@/components/HomePage';
import BlinkPage from '@/components/BlinkPage';
import SkyPage from '@/components/SkyPage';
import AboutPage from '@/components/AboutPage';

export default function Home() {
  const { currentView, openShowcase } = useAppStore();

  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      const s = useAppStore.getState();
      if (hash.startsWith('#/blink/')) {
        openShowcase(hash.replace('#/blink/', '').split('?')[0] || '3i-atlas');
      } else if (hash.startsWith('#/blink')) {
        s.setCurrentView('blink');
      } else if (hash.startsWith('#/sky')) {
        s.setCurrentView('sky');
      } else if (hash.startsWith('#/about')) {
        s.setCurrentView('about');
      } else {
        s.setCurrentView('home');
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [openShowcase]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        {currentView === 'home' && <HomePage />}
        {currentView === 'blink' && <BlinkPage />}
        {currentView === 'sky' && <SkyPage />}
        {currentView === 'about' && <AboutPage />}
      </main>
      <footer className="border-t border-slate-800 py-6 px-4">
        <div className="max-w-7xl mx-auto text-center text-slate-400 text-sm">
          <p>SpectraHunt · NASA Space Apps 2026 · SPHEREx QR2 · DOI 10.26131/IRSA652</p>
        </div>
      </footer>
    </div>
  );
}
