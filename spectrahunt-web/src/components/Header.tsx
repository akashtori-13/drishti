'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

const NAV = [
  { href: '/', label: 'Home', home: true },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink' },
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
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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

  const isActive = (href: string, match?: string) =>
    match !== undefined ? pathname.startsWith(match) : pathname === href;

  return (
    <header className={`nav${open ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-name">SpectraHunt</span>
        </Link>
        <nav className="tabs tabs-desktop" aria-label="Primary">
          {NAV.filter((item) => !(item.home && pathname === '/')).map((item) => {
            const active = item.match !== undefined
              ? pathname.startsWith(item.match)
              : pathname === item.href;
            return (
              <Link
                key={item.href} href={item.href}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/sky" className="btn-primary-sm">Open sky map</Link>
        </nav>
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
          {NAV.filter((item) => !(item.home && pathname === '/')).map((item) => (
            <Link
              key={item.href} href={item.href}
              className={isActive(item.href, item.match) ? 'active' : undefined}
              aria-current={isActive(item.href, item.match) ? 'page' : undefined}
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
