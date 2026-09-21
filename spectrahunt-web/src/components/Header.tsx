'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

const NAV = [
  { href: '/blink/3i-atlas', label: 'Blink' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/about', label: 'About' },
];

const TITLES: Record<string, string> = {
  '/': 'SpectraHunt: hunt what moves in the infrared sky',
  '/sky': 'Sky map — SpectraHunt',
  '/candidates': 'Candidates — SpectraHunt',
  '/about': 'About — SpectraHunt',
};

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const onBlink = pathname.startsWith('/blink/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // focus trap + outside-click close for the mobile menu
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>('a, button')?.focus();
    const onDown = (e: MouseEvent) => {
      if (menu && !menu.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !menu) return;
      const items = [...menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onTab);
    };
  }, [open ]);

  useEffect(() => {
    document.title = TITLES[pathname] ?? (pathname.startsWith('/blink/') ? 'Blink — SpectraHunt' : 'SpectraHunt');
  }, [pathname]);

  // help menu: outside-click + Escape close
  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelpOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  const isActive = (href: string) => pathname === href;

  return (
    <header className={`nav${open ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-name">SpectraHunt</span>
        </Link>
        <nav className="tabs tabs-desktop" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href} href={item.href}
              className={isActive(item.href) ? 'active' : undefined}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/sky" className="btn-primary-sm">Open sky map</Link>
        </nav>
        <div className="nav-actions">
          {onBlink && (
            <button
              type="button" className="nav-iconbtn" title="Save current view as PNG"
              aria-label="Save current view as PNG"
              onClick={() => window.dispatchEvent(new CustomEvent('spectrahunt:export', { detail: { kind: 'png' } }))}
            >
              <Icon name="save" className="icon" />
            </button>
          )}
          <div className="help-wrap" ref={helpRef}>
            <button
              type="button" className="nav-iconbtn" title="Help" aria-label="Help"
              aria-expanded={helpOpen} aria-haspopup="menu"
              onClick={() => setHelpOpen((o) => !o)}
            >
              <Icon name="help" className="icon" />
            </button>
            {helpOpen && (
              <div className="help-menu glass" role="menu" aria-label="Help">
                <Link href="/about" role="menuitem" onClick={() => setHelpOpen(false)}>Guided tours</Link>
                <Link href="/about" role="menuitem" onClick={() => setHelpOpen(false)}>Glossary</Link>
                <span className="help-sep" aria-hidden="true" />
                <span className="help-keys" aria-label="Keyboard shortcuts">
                  <span><kbd>Space</kbd> play / pause</span>
                  <span><kbd>←</kbd><kbd>→</kbd> step epoch</span>
                  <span><kbd>Ctrl/⌘ K</kbd> commands</span>
                </span>
                <button
                  type="button" role="menuitem" className="epoch-chip"
                  onClick={() => { setHelpOpen(false); window.dispatchEvent(new Event('spectrahunt:palette')); }}
                >
                  Open command palette
                </button>
              </div>
            )}
          </div>
        <button
          ref={btnRef}
          type="button" className="nav-menu-btn" aria-expanded={open}
          aria-controls="navSheet" aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="menu" className="icon nav-menu-ic" />
          <Icon name="x" className="icon nav-close-ic" />
        </button>
      </div>
      {open && (
        <div ref={menuRef} id="navSheet" className="nav-sheet" role="dialog" aria-label="Menu">
          {NAV.map((item) => (
            <Link
              key={item.href} href={item.href}
              className={isActive(item.href) ? 'active' : undefined}
              aria-current={isActive(item.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/sky" className="btn-primary-sm" onClick={() => setOpen(false)}>Open sky map</Link>
        </div>
      )}
    </header>
  );
}
