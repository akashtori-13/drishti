'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import { blinkURL } from '@/lib/store';

const LINKS = [
  { href: '/sky', label: 'Sky map', desc: 'Observer and all-sky views' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink', desc: 'Compare epochs' },
  { href: '/candidates', label: 'Candidates', desc: 'Measured fields' },
  { href: '/about', label: 'About', desc: 'Mission and method' },
];

function contextFor(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname === '/sky') return 'Sky map';
  if (pathname === '/candidates') return 'Candidates';
  if (pathname === '/about') return 'About';
  const m = pathname.match(/^\/blink\/([^/]+)/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (id === 'live') return 'Live field';
    return id.replace(/-/g, ' ');
  }
  return 'SpectraHunt';
}

/** Command-bar HUD: brand dot, context pill, overlay nav + search. */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = pathname === '/'
      ? 'SpectraHunt: hunt what moves in the infrared sky'
      : `${contextFor(pathname)} — SpectraHunt`;
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target as HTMLElement).tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (t: SearchTarget) => {
    setOpen(false);
    if (t.showcaseId) {
      router.push(blinkURL(t.showcaseId));
      return;
    }
    try {
      sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
    } catch { /* noop */ }
    router.push('/sky');
  };

  return (
    <>
      <div className="cmdbar">
        <Link className="cmd-brand" href="/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
        </Link>
        <button type="button" className="cmd-pill" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-haspopup="dialog" title="Navigate or jump anywhere (Ctrl+K)">
          <span className="cmd-context">{contextFor(pathname)}</span>
          <kbd className="cmd-kbd" aria-hidden="true">⌘K</kbd>
        </button>
      </div>
      {open && (
        <div className="cmd-veil" onMouseDown={() => setOpen(false)}>
          <div ref={panelRef} className="cmd-panel glass" role="dialog" aria-modal="true" aria-label="Navigate"
            onMouseDown={(e) => e.stopPropagation()}>
            <SearchBox id="nav-search" placeholder="Jump to an object, field, or coordinates" onPick={pick} />
            <nav className="cmd-links" aria-label="Primary">
              {LINKS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  <span className="cmd-link-label">{item.label}</span>
                  <span className="cmd-link-desc">{item.desc}</span>
                </Link>
              ))}
            </nav>
            <div className="cmd-foot">
              <SurpriseButton
                onPick={(t) => {
                  setOpen(false);
                  if (t.showcaseId) router.push(blinkURL(t.showcaseId));
                  else {
                    try {
                      sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
                    } catch { /* noop */ }
                    router.push('/sky');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
