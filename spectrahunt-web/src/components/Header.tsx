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
 * Expanded: shell morphs and ONE panel renders inside — menu sheet on menu
 * tap, search (+carousel when idle) on search tap or desktop hover. Panels
 * are exclusive so the island never clutters.
 */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [panel, setPanel] = useState<'menu' | 'search' | null>(null);
  const [hovered, setHovered] = useState(false);
  const [searching, setSearching] = useState(false);
  const [miniQ, setMiniQ] = useState('');
  const [fields, setFields] = useState<Showcase[] | null>(null);
  const openPreview = useAppStore((s) => s.openPreview);
  const islandRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const expanded = panel !== null || hovered;
  const showSearch = panel === 'search' || (hovered && panel === null);
  const showCarousel = expanded && panel !== 'menu' && !searching;

  useEffect(() => {
    document.title = pathname === '/'
      ? 'STELLAR: hunt what moves in the infrared sky'
      : `${LINKS.find((n) => pathname === n.href || (n.match && pathname.startsWith(n.match)))?.label ?? 'STELLAR'} — STELLAR`;
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanel(null);
  }, [pathname]);

  useEffect(() => {
    // Clear the mini-bar text once the panel closes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (panel === null) setMiniQ('');
  }, [panel]);

  // Single Ctrl+K toggle listener (mounted once).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPanel((p) => (p === 'search' ? null : 'search'));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Veil dialog: Escape close, outside click, focus trap + initial/return focus.
  // Anchored to the island body. Runs only for click-opened panels, never
  // for hover previews (which must not steal focus).
  useEffect(() => {
    if (!panel) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const panelEl = islandRef.current?.querySelector<HTMLElement>('.island-body');
    const first = panelEl?.querySelector<HTMLElement>('input, a[href], button:not([disabled])');
    (first ?? undefined)?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
      }
      if (e.key === 'Tab' && panelEl) {
        const items = panelEl.querySelectorAll<HTMLElement>(
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
      if (panelEl && !panelEl.contains(e.target as Node)) {
        setPanel(null);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      triggerRef.current?.focus?.();
    };
  }, [panel]);

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
    setPanel(null);
    setSearching(false);
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
  const candActive = pathname.startsWith('/candidates');
  const surprisePick = (t: SearchTarget) => {
    setPanel(null);
    if (t.showcaseId) openPreview(t.showcaseId);
    else {
      try {
        sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
      } catch { /* noop */ }
      router.push('/sky');
    }
  };
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
        {pathname !== '/' && (
          <form
            className="island-mini"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setPanel('search');
            }}
          >
            <Icon name="search" className="icon" />
            <input
              value={miniQ}
              onChange={(e) => { setMiniQ(e.target.value); setPanel('search'); }}
              onFocus={() => setPanel('search')}
              placeholder="Jump to an object or field…"
              aria-label="Jump to an object or field"
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
            />
          </form>
        )}
        {pathname !== '/' && (
          <button type="button" className="island-iconbtn" aria-label="Search and navigate (Ctrl+K)"
            title="Search and navigate (Ctrl+K)" onClick={() => { setHovered(false); setPanel((p) => (p === 'search' ? null : 'search')); }}>
            <Icon name="search" className="icon" />
            <span className="ibtn-label" aria-hidden="true">Search</span>
          </button>
        )}
        <Link href="/candidates" aria-label="Candidate fields"
          aria-current={candActive ? 'page' : undefined}
          className={`island-iconbtn${candActive ? ' active' : ''}`}>
          <Icon name="target" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Fields</span>
        </Link>
        <button type="button" className="island-iconbtn" aria-label={panel === 'menu' ? 'Close menu' : 'Open menu'}
          aria-expanded={expanded} aria-controls="island-body"
          onClick={() => {
            setHovered(false);
            setPanel((p) => (p === 'menu' ? null : 'menu'));
          }}>
          <Icon name={panel === 'menu' ? 'x' : 'menu'} className="icon" />
          <span className="ibtn-label" aria-hidden="true">Menu</span>
        </button>
      </div>
      <div className="island-body-wrap" aria-hidden={!expanded}>
        <div
          id="island-body"
          className="island-body"
          onFocusCapture={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') setSearching(true);
          }}
          onBlurCapture={() => setSearching(false)}
        >
          {panel === 'menu' && (
            <nav className="cmd-links sheet island-sheet" aria-label="Views">
              <SurpriseButton className="cmd-surprise" onPick={surprisePick} />
              {[{ href: '/', label: 'Home', desc: 'Front door' }, ...LINKS.map((l) => ({
                ...l,
                desc: l.label === 'Sky' ? 'Observer and all-sky views'
                  : l.label === 'Blink' ? 'Compare epochs'
                  : l.label === 'Candidates' ? 'Measured fields' : 'Mission and method',
              }))].map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setPanel(null)}>
                  <span className="cmd-link-label">{item.label}</span>
                  <span className="cmd-link-desc">{item.desc}</span>
                </Link>
              ))}
            </nav>
          )}
          {showSearch && (
            <SearchBox id="nav-search" placeholder="Jump to an object or field…" defaultValue={miniQ} onPick={pick} />
          )}
          {showCarousel && fields && fields.length > 0 && (
            <div className="island-carousel">
              <FeaturedCycle fields={fields} consoleMode={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
