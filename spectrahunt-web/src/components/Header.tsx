'use client';

import { useEffect, useState } from 'react';
import { useAppStore, type View } from '@/lib/store';
import Icon from '@/components/Icon';

const NAV: Array<{ id: View; label: string }> = [
  { id: 'sky', label: 'Sky map' },
  { id: 'blink', label: 'Blink' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'about', label: 'About' },
];

export default function Header() {
  const { currentView, setCurrentView } = useAppStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className={`nav${open ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <a className="brand" href="#/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-name">SpectraHunt</span>
        </a>
        <nav className="tabs" id="navTabs" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setOpen(false); }}
              className={currentView === item.id || (item.id === 'blink' && currentView === 'blink') ? 'active' : ''}
              aria-current={currentView === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button" className="nav-menu-btn" aria-expanded={open}
          aria-controls="navTabs" aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="menu" className="icon nav-menu-ic" />
          <Icon name="x" className="icon nav-close-ic" />
        </button>
      </div>
    </header>
  );
}
