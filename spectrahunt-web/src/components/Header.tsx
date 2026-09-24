'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import { FeaturedCycle } from '@/components/FeaturedCarousel';
import { SHOWCASE_IDS, getShowcase, type Showcase } from '@/lib/showcases';
import { useAppStore } from '@/lib/store';
import { nearestShowcase } from '@/lib/sky';

const LINKS = [
  { href: '/sky', label: 'Sky' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/about', label: 'About' },
];

/**
 * Dynamic-island navbar.
 *
 * Collapsed: brand + nav links + icon buttons (classic pill).
 * Expanded: shell morphs (radius spring) and search + featured carousel
 * render *inside* the island. Opens on menu/search tap (all screens) or
 * hover (fine pointers only).
 */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [fields, setFields] = useState<Showcase[] | null>(null);
  const openPreview = useAppStore((s) => s.openPreview);
  const islandRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const expanded = open || menu || hovered;

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
  // Now anchored to the island body (menus render inside the island itself).
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const panel = islandRef.current?.querySelector<HTMLElement>('.island-body');
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

  // Featured carousel data: fetched once, the first time the island expands.
  useEffect(() => {
    if (!expanded || fields) return;
    let alive = true;
    void Promise.all(SHOWCASE_IDS.map((id) => getShowcase(id).catch(() => null))).then((docs) => {
      if (alive) setFields(docs.filter((d): d is Showcase => d !== null));
    });
    return () => { alive = false; };
  }, [expanded, fields]);

  const fineHover = () => {
    try {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      return false;
    }
  };
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

  // Five destinations max, thumb-zone ordered: home, sky, search, dice, menu.
  const skyActive = pathname === '/sky';
  return (
    <div
      ref={islandRef}
      className="island glass"
      role="navigation"
      aria-label="Primary"
      data-expanded={expanded || undefined}
      onMouseEnter={() => { if (fineHover()) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="island-row">
        <Link className="island-brand island-iconbtn" href="/" aria-label="STELLAR home"
          aria-current={pathname === '/' ? 'page' : undefined}>
          <Icon name="logo" className="logo icon" />
          <span className="brand-name" aria-hidden="true">STELLAR</span>
        </Link>
        <Link href="/sky" aria-label="Sky map"
          aria-current={skyActive ? 'page' : undefined}
          className={`island-iconbtn${skyActive ? ' active' : ''}`}>
          <Icon name="skymap" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Sky</span>
        </Link>
        <button type="button" className="island-iconbtn" aria-label="Search and navigate (Ctrl+K)"
          title="Search and navigate (Ctrl+K)" onClick={() => { setMenu(false); setOpen(true); }}>
          <Icon name="search" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Search</span>
        </button>
        <SurpriseButton
          compact
          label="Surprise"
          className="island-iconbtn"
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
        <button type="button" className="island-iconbtn" aria-label={menu && open ? 'Close menu' : 'Open menu'}
          aria-expanded={expanded} aria-controls="island-body"
          onClick={() => {
            if (open && menu) { setOpen(false); setMenu(false); }
            else { setMenu(true); setOpen(true); }
          }}>
          <Icon name={menu && open ? 'x' : 'menu'} className="icon" />
          <span className="ibtn-label" aria-hidden="true">Menu</span>
        </button>
      </div>
      <div className="island-body-wrap" aria-hidden={!expanded}>
        <div id="island-body" className="island-body">
          {menu && (
            <nav className="cmd-links sheet island-sheet" aria-label="Views">
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
          {fields && fields.length > 0 && (
            <div className="island-carousel">
              <FeaturedCycle fields={fields} consoleMode={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
