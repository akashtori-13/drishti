'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import SurpriseButton from '@/components/SurpriseButton';
import { useLive } from '@/lib/showcases';
import { blinkURL } from '@/lib/store';

const NAV = [
  { href: '/sky', label: 'Sky map', blurb: 'Observer and all-sky views' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink', blurb: 'Compare epochs' },
  { href: '/candidates', label: 'Candidates', blurb: 'Fields worth a look' },
  { href: '/about', label: 'About', blurb: 'Mission and method' },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.dataset.view = pathname === '/sky' ? 'sky' : '';
    document.title = pathname === '/'
      ? 'SpectraHunt: hunt what moves in the infrared sky'
      : `${NAV.find((n) => pathname === n.href || (n.match && pathname.startsWith(n.match)))?.label ?? 'SpectraHunt'} — SpectraHunt`;
  }, [pathname]);

  return (
    <header className={`nav${open ? ' menu-open' : ''}${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="SpectraHunt home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-text">
            <span className="brand-name">SpectraHunt</span>
            <span className="brand-sub">SPHEREx time machine</span>
          </span>
        </Link>
        <nav className="tabs" id="navTabs" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.match !== undefined && pathname.startsWith(item.match));
            return (
              <Link
                key={item.href} href={item.href} onClick={() => setOpen(false)}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
                title={item.blurb}
              >
                {item.label}
              </Link>
            );
          })}
          {open && (
            <p className="nav-note">Blink repeated sky visits · spot what moved</p>
          )}
        </nav>
        <div className="nav-right">
          <span className="status-pill" title={useLive ? 'Connected to the live IRSA-backed API' : 'Running from the offline static bundle'}>
            <span className="live-dot" aria-hidden="true" />
            {useLive ? 'Live' : 'Offline-ready'}
          </span>
          <SurpriseButton
            compact
            className="nav-dice"
            onPick={(t) => {
              setOpen(false);
              if (t.showcaseId) router.push(blinkURL(t.showcaseId));
              else router.push(`/sky`);
            }}
          />
          <button
            type="button" className="nav-menu-btn" aria-expanded={open}
            aria-controls="navTabs" aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="menu" className="icon nav-menu-ic" />
            <Icon name="x" className="icon nav-close-ic" />
          </button>
        </div>
      </div>
    </header>
  );
}
