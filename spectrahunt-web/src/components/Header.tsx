'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import { blinkURL } from '@/lib/store';

const LINKS = [
  { href: '/sky', label: 'Sky' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/about', label: 'About' },
];

/** Dynamic-island navbar: brand, views, search, surprise in one floating pill. */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = pathname === '/'
      ? 'STELLAR: hunt what moves in the infrared sky'
      : `${LINKS.find((n) => pathname === n.href || (n.match && pathname.startsWith(n.match)))?.label ?? 'STELLAR'} — STELLAR`;
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    setMenu(false);
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

  const isActive = (href: string, match?: string) =>
    match !== undefined ? pathname.startsWith(match) : pathname === href;

  return (
    <>
      <div className="island glass" role="navigation" aria-label="Primary">
        <Link className="island-brand" href="/" aria-label="STELLAR home">
          <Icon name="logo" className="logo icon" />
          <span className="brand-name">STELLAR</span>
        </Link>
        <nav className="island-links" aria-label="Views">
          {LINKS.map((item) => {
            const on = isActive(item.href, item.match);
            return (
              <Link key={item.href} href={item.href}
                className={on ? 'active' : undefined}
                aria-current={on ? 'page' : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" className="island-icon" aria-label="Search and navigate (Ctrl+K)"
          title="Search and navigate (Ctrl+K)" onClick={() => setOpen(true)}>
          <Icon name="search" className="icon" />
        </button>
        <SurpriseButton
          compact
          className="island-icon"
          onPick={(t) => {
            if (t.showcaseId) router.push(blinkURL(t.showcaseId));
            else {
              try {
                sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
              } catch { /* noop */ }
              router.push('/sky');
            }
          }}
        />
        <button type="button" className="island-menu" aria-label="Open menu"
          aria-expanded={menu} onClick={() => { setMenu((m) => !m); setOpen(true); }}>
          <Icon name="menu" className="icon" />
        </button>
      </div>
      {open && (
        <div className="cmd-veil" onMouseDown={() => { setOpen(false); setMenu(false); }}>
          <div ref={panelRef} className="cmd-panel glass" role="dialog" aria-modal="true" aria-label="Navigate"
            onMouseDown={(e) => e.stopPropagation()}>
            {menu && (
              <nav className="cmd-links sheet" aria-label="Views">
                {[{ href: '/', label: 'Home', desc: 'Front door' }, ...LINKS.map((l) => ({
                  ...l,
                  desc: l.label === 'Sky' ? 'Observer and all-sky views'
                    : l.label === 'Blink' ? 'Compare epochs'
                    : l.label === 'Candidates' ? 'Measured fields' : 'Mission and method',
                }))].map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => { setOpen(false); setMenu(false); }}>
                    <span className="cmd-link-label">{item.label}</span>
                    <span className="cmd-link-desc">{item.desc}</span>
                  </Link>
                ))}
              </nav>
            )}
            <SearchBox id="nav-search" placeholder="Jump to an object, field, or coordinates" onPick={pick} />
            <div className="cmd-foot">
              <SurpriseButton onPick={(t) => {
                setOpen(false); setMenu(false);
                if (t.showcaseId) router.push(blinkURL(t.showcaseId));
                else {
                  try {
                    sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
                  } catch { /* noop */ }
                  router.push('/sky');
                }
              }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
