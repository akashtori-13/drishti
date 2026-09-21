'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import Header from '@/components/Header';
import HomePage from '@/components/HomePage';
import MapPage from '@/components/MapPage';
import FieldPage from '@/components/FieldPage';
import CandidatesPage from '@/components/CandidatesPage';
import AboutPage from '@/components/AboutPage';
import BlinkPage from '@/components/BlinkPage';

export default function Home() {
  const { 
    currentView, 
    loadStatus, 
    loadCoverage, 
    loadCandidates,
    setSelectedField 
  } = useAppStore();

  // Load initial data on mount
  useEffect(() => {
    loadStatus();
    loadCoverage();
    loadCandidates({ limit: 20 });

    // Handle hash routing
    const handleHashChange = () => {
      const hash = window.location.hash;
      
      if (hash === '#/' || hash === '') {
        useAppStore.getState().setCurrentView('home');
      } else if (hash === '#/map') {
        useAppStore.getState().setCurrentView('map');
      } else if (hash.startsWith('#/field')) {
        const params = new URLSearchParams(hash.replace('#/field', ''));
        const ra = parseFloat(params.get('ra') || '0');
        const dec = parseFloat(params.get('dec') || '0');
        setSelectedField(ra, dec);
      } else if (hash === '#/candidates') {
        useAppStore.getState().setCurrentView('candidates');
      } else if (hash.startsWith('#/blink')) {
        useAppStore.getState().setCurrentView('blink');
      } else if (hash === '#/about') {
        useAppStore.getState().setCurrentView('about');
      }
    };

    // Initial check
    handleHashChange();

    // Listen for changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [loadStatus, loadCoverage, loadCandidates, setSelectedField]);

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomePage />;
      case 'map':
        return <MapPage />;
      case 'field':
        return <FieldPage />;
      case 'candidates':
        return <CandidatesPage />;
      case 'blink':
        return <BlinkPage />;
      case 'about':
        return <AboutPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        {renderView()}
      </main>
      <footer className="border-t border-slate-800 py-6 px-4">
        <div className="max-w-7xl mx-auto text-center text-slate-400 text-sm">
          <p>SpectraHunt © 2026 NASA Space Apps Challenge</p>
          <p className="mt-2">
            Data from SPHEREx QR2 release • 
            <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
              IRSA Archive
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
