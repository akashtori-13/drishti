'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import { useAppStore } from '@/lib/store';
import { nearestShowcase } from '@/lib/sky';

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
  const openPreview = useAppStore((s) => s.openPreview);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  // Single Ctrl+K toggle listener (mounted once).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Veil dialog: Escape close, outside click, focus trap + initial/return focus.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, a[href], button:not([disabled])');
    (first ?? undefined)?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setMenu(false);
      }
      if (e.key === 'Tab' && panel) {
        const items = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    const onDown = (e: MouseEvent) => {
      if (panel && !panel.contains(e.target as Node)) {
        setOpen(false);
        setMenu(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  const pick = (t: SearchTarget) => {
    setOpen(false);
    if (t.showcaseId) {
      openPreview(t.showcaseId);
      return;
    }
    const near = nearestShowcase(t.ra, t.dec);
    if (near) {
      openPreview(near);
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
            if (t.showcaseId) openPreview(t.showcaseId);
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
          <div ref={panelRef} className="cmd-panel glass" role="dialog" aria-modal="true" aria-label="Navigate" tabIndex={-1}
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
                if (t.showcaseId) openPreview(t.showcaseId);
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
