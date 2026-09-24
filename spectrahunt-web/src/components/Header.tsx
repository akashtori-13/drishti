'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/Icon';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import { useAppStore } from '@/lib/store';
import { nearestShowcase } from '@/lib/sky';

const LINKS = [
  { href: '/sky', label: 'Sky', desc: 'Observer and all-sky views' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink', desc: 'Compare epochs' },
  { href: '/candidates', label: 'Fields', desc: 'Measured fields' },
  { href: '/about', label: 'About', desc: 'Mission and method' },
];

/**
 * Plain navbar: one fixed-height row, no morphing, no resizing panels.
 * Desktop row: brand, Sky link, search input (flex), Fields link, menu.
 * Mobile row: brand, sky/search/fields icons, menu (bottom dock); the
 * search icon swaps in a full-width input row at the same height.
 * Typing hides every sibling control (logo stays) with a width animation.
 * Suggestions and the menu sheet are absolutely positioned overlays —
 * page content never shifts.
 */
export default function Header() {
  const rawPathname = usePathname();
  // Trailing-slash URLs (/sky/) must match route checks (/sky).
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mSearch, setMSearch] = useState(false);
  const [typing, setTyping] = useState(false);
  const openPreview = useAppStore((s) => s.openPreview);
  const islandRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = pathname === '/'
      ? 'STELLAR: hunt what moves in the infrared sky'
      : `${LINKS.find((n) => pathname === n.href || (n.match && pathname.startsWith(n.match)))?.label ?? 'STELLAR'} — STELLAR`;
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMSearch(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyping(false);
  }, [pathname]);

  // Ctrl+K: focus the desktop input, or open the mobile input row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const desktop = document.querySelector<HTMLInputElement>('#nav-search-input');
        if (desktop && getComputedStyle(desktop).display !== 'none') {
          desktop.focus();
        } else {
          setMSearch(true);
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>('#nav-msearch-input')?.focus();
          });
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Menu sheet: Escape closes, outside click closes, focus trap + return focus.
  useEffect(() => {
    if (!menuOpen) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const sheet = islandRef.current?.querySelector<HTMLElement>('.menu-sheet');
    const first = sheet?.querySelector<HTMLElement>('a[href], button:not([disabled])');
    (first ?? undefined)?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key === 'Tab' && sheet) {
        const items = sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMSearch(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      triggerRef.current?.focus?.();
    };
  }, [menuOpen]);

  const pick = (t: SearchTarget) => {
    setMSearch(false);
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

  const surprisePick = (t: SearchTarget) => {
    setMenuOpen(false);
    if (t.showcaseId) openPreview(t.showcaseId);
    else {
      try {
        sessionStorage.setItem('sh-target', JSON.stringify({ ra: t.ra, dec: t.dec }));
      } catch { /* noop */ }
      router.push('/sky');
    }
  };

  // Typing mode: any navbar input holding text collapses the sibling controls.
  // Bubble phase (not capture): capture-phase parent setState would flush
  // before the input's own onChange runs, resetting the controlled value and
  // eating the keystroke.
  const onNavInput = (e: React.FormEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT') {
      setTyping((el as HTMLInputElement).value.trim().length > 0);
    }
  };

  const skyActive = pathname === '/sky';
  const candActive = pathname.startsWith('/candidates');

  // Menu hierarchy: Home first, product views in navbar order, About last,
  // then the Surprise action separated below. Labels match the navbar.
  const MENU: { href: string; label: string; desc: string; icon: IconName; active: boolean }[] = [
    { href: '/', label: 'Home', desc: 'Front door', icon: 'home', active: pathname === '/' },
    { href: '/sky', label: 'Sky', desc: 'Observer and all-sky views', icon: 'skymap', active: skyActive },
    { href: '/blink/3i-atlas', label: 'Blink', desc: 'Compare epochs', icon: 'split', active: pathname.startsWith('/blink') },
    { href: '/candidates', label: 'Fields', desc: 'Measured fields', icon: 'target', active: candActive },
    { href: '/about', label: 'About', desc: 'Mission and method', icon: 'info', active: pathname === '/about' },
  ];

  return (
    <div
      ref={islandRef}
      className="island glass"
      role="navigation"
      aria-label="Primary"
      data-typing={typing || undefined}
      onInput={onNavInput}
      onKeyUp={onNavInput}
    >
      <div className="island-row">
        <Link className="island-brand island-iconbtn" href="/" aria-label="STELLAR home"
          aria-current={pathname === '/' ? 'page' : undefined}>
          <Icon name="logo" className="logo icon" />
          <span className="brand-name collapsible" aria-hidden="true">STELLAR</span>
        </Link>
        <Link href="/sky" aria-label="Sky map"
          aria-current={skyActive ? 'page' : undefined}
          className={`nav-textlink collapsible${skyActive ? ' active' : ''}`}>
          Sky
        </Link>
        <Link href="/sky" aria-label="Sky map"
          aria-current={skyActive ? 'page' : undefined}
          className={`island-iconbtn nav-icononly collapsible${skyActive ? ' active' : ''}`}>
          <Icon name="skymap" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Sky</span>
        </Link>
        <div
          className="nav-search"
          role="search"
        >
          <Icon name="search" className="icon" />
          <SearchBox key={pathname} id="nav-search" placeholder="Jump to an object or field…" onPick={pick} />
          <kbd className="kbd-hint" aria-hidden="true">⌘K</kbd>
        </div>
        <button type="button" className="island-iconbtn nav-msearch-toggle collapsible" aria-label="Search and navigate (Ctrl+K)"
          title="Search and navigate (Ctrl+K)" onClick={() => setMSearch(true)}>
          <Icon name="search" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Search</span>
        </button>
        <Link href="/candidates" aria-label="Candidate fields"
          aria-current={candActive ? 'page' : undefined}
          className={`nav-textlink collapsible${candActive ? ' active' : ''}`}>
          Fields
        </Link>
        <Link href="/candidates" aria-label="Candidate fields"
          aria-current={candActive ? 'page' : undefined}
          className={`island-iconbtn nav-icononly collapsible${candActive ? ' active' : ''}`}>
          <Icon name="target" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Fields</span>
        </Link>
        <button type="button" className="island-iconbtn collapsible" aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen} aria-controls={menuOpen ? 'menu-sheet' : undefined}
          onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'x' : 'menu'} className="icon" />
          <span className="ibtn-label" aria-hidden="true">Menu</span>
        </button>
      </div>
      <div className="island-mrow" data-open={mSearch || undefined}>
        <button type="button" className="island-iconbtn" aria-label="Back to navigation"
          onClick={() => setMSearch(false)}>
          <Icon name="back" className="icon" />
        </button>
        <div
          className="nav-search"
          role="search"
        >
          <Icon name="search" className="icon" />
          <SearchBox key={pathname} id="nav-msearch" placeholder="Jump to an object or field…" onPick={pick} />
        </div>
      </div>
      {menuOpen && (
        <nav id="menu-sheet" className="menu-sheet glass" aria-label="Views">
          {MENU.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
              aria-current={item.active ? 'page' : undefined}
              className={`menu-link${item.active ? ' active' : ''}`}>
              <Icon name={item.icon} className="icon" />
              <span className="menu-text">
                <span className="menu-label">{item.label}</span>
                <span className="menu-desc">{item.desc}</span>
              </span>
              <Icon name="fwd" className="icon m-chev" />
            </Link>
          ))}
          <div className="menu-div" role="separator" aria-hidden="true" />
          <SurpriseButton className="menu-link menu-action" onPick={surprisePick} desc="Open a random blink" />
        </nav>
      )}
    </div>
  );
}
