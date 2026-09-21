'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';

const NAV = [
  { href: '/sky', label: 'Sky map' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/about', label: 'About' },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.dataset.view = pathname === '/sky' ? 'sky' : '';
    document.title = pathname === '/'
      ? 'SpectraHunt: hunt what moves in the infrared sky'
      : `${NAV.find((n) => pathname === n.href || (n.match && pathname.startsWith(n.match)))?.label ?? 'SpectraHunt'} — SpectraHunt`;
  }, [pathname]);

  return (
    <header className={`nav${open ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-name">SpectraHunt</span>
        </Link>
        <nav className="tabs" id="navTabs" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.match !== undefined && pathname.startsWith(item.match));
            return (
              <Link
                key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
                style={{ textDecoration: 'none', display: 'inline-block', padding: '8px 14px', borderRadius: 999, fontSize: '.875rem', fontWeight: 500, color: 'var(--ink-2)' }}
              >
                {item.label}
              </Link>
            );
          })}
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
