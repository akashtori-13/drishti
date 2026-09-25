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
  { href: '/sky', label: 'SkyMap', desc: 'Observer and all-sky views' },
  { href: '/blink/3i-atlas', label: 'Blink', match: '/blink', desc: 'Compare epochs' },
  { href: '/candidates', label: 'Featured', desc: 'Measured fields' },
  { href: '/about', label: 'About', desc: 'The crew' },
  { href: '/mission', label: 'Mission', desc: 'Method and data' },
];

/**
 * Where "Get the app" points. Today every platform lands on the GitHub
 * releases page (APK, AppImage/deb, exe). Tomorrow this branches into
 * platform-aware store links — keep all routing here.
 */
function appLink(): string {
  return 'https://github.com/akashtori-13/stellar/releases';
}

/**
 * Dynamic-island navbar: a fixed pill that morphs open to contain the menu
 * (desktop; mobile menu rises above the dock), and reduces back on close.
 * Typing hides every sibling control (logo stays) with a width animation.
 * Desktop search suggestions overlay below the bar with a spring entrance.
 */
export default function Header() {
  const rawPathname = usePathname();
  // Trailing-slash URLs (/sky/) must match route checks (/sky).
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Animated close: flag first (CSS plays the exit), unmount after.
  // Reduced motion skips the wait and closes instantly.
  const closeMenu = () => {
    if (!menuOpen || menuClosing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMenuOpen(false);
      return;
    }
    setMenuClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 240);
  };

  useEffect(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuClosing(false);
    setMSearch(false);
    setTyping(false);
  }, [pathname]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Ctrl+K: navbar input, else the page's own search (hero, map tools),
  // else the mobile input row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const visible = (s: string) => {
          const el = document.querySelector<HTMLInputElement>(s);
          return el && getComputedStyle(el).display !== 'none' ? el : null;
        };
        const target = visible('#nav-search-input') ?? visible('#hs-input') ?? visible('#ms-input');
        if (target) target.focus();
        else {
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
      if (e.key === 'Escape') closeMenu();
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
        closeMenu();
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
    closeMenu();
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
  // Home and SkyMap have their own search surfaces (hero, map tools):
  // the navbar carries no search affordance there.
  const bare = pathname === '/' || skyActive;

  // Menu hierarchy: Home first, product views in navbar order, About last,
  // then the Surprise action separated below. Labels match the navbar.
  const MENU: { href: string; label: string; desc: string; icon: IconName; active: boolean }[] = [
    { href: '/', label: 'Home', desc: 'Front door', icon: 'home', active: pathname === '/' },
    { href: '/sky', label: 'SkyMap', desc: 'Observer and all-sky views', icon: 'skymap', active: skyActive },
    { href: '/blink/3i-atlas', label: 'Blink', desc: 'Compare epochs', icon: 'split', active: pathname.startsWith('/blink') },
    { href: '/candidates', label: 'Featured', desc: 'Measured fields', icon: 'target', active: candActive },
    { href: '/mission', label: 'Mission', desc: 'Method and data', icon: 'info', active: pathname === '/mission' },
    { href: '/about', label: 'About', desc: 'The crew', icon: 'team', active: pathname === '/about' },
  ];

  return (
    <div
      ref={islandRef}
      className="island glass"
      role="navigation"
      aria-label="Primary"
      data-typing={typing || undefined}
      data-home={pathname === '/' || undefined}
      data-open={menuOpen || undefined}
      onInput={onNavInput}
      onKeyUp={onNavInput}
    >
      <div className="island-row">
        <Link className="island-brand island-iconbtn" href="/" aria-label="STELLAR home"
          aria-current={pathname === '/' ? 'page' : undefined}>
          <Icon name="logo" className="logo icon" />
          <span className="brand-name collapsible" aria-hidden="true">STELLAR</span>
        </Link>
        <Link href="/sky" aria-label="SkyMap"
          aria-current={skyActive ? 'page' : undefined}
          className={`nav-textlink collapsible${skyActive ? ' active' : ''}`}>
          SkyMap
        </Link>
        <Link href="/sky" aria-label="SkyMap"
          aria-current={skyActive ? 'page' : undefined}
          className={`island-iconbtn nav-icononly collapsible${skyActive ? ' active' : ''}`}>
          <Icon name="skymap" className="icon" />
          <span className="ibtn-label" aria-hidden="true">SkyMap</span>
        </Link>
        {!bare && (
          <div
            className="nav-search"
            role="search"
          >
            <Icon name="search" className="icon" />
            <SearchBox key={pathname} id="nav-search" placeholder="Jump to an object or field…" onPick={pick} />
            <kbd className="kbd-hint" aria-hidden="true">⌘K</kbd>
          </div>
        )}
        {!bare && (
          <button type="button" className="island-iconbtn nav-msearch-toggle collapsible" aria-label="Search and navigate (Ctrl+K)"
            title="Search and navigate (Ctrl+K)" onClick={() => setMSearch(true)}>
            <Icon name="search" className="icon" />
            <span className="ibtn-label" aria-hidden="true">Search</span>
          </button>
        )}
        <Link href="/candidates" aria-label="Featured fields"
          aria-current={candActive ? 'page' : undefined}
          className={`nav-textlink collapsible${candActive ? ' active' : ''}`}>
          Featured
        </Link>
        <Link href="/candidates" aria-label="Featured fields"
          aria-current={candActive ? 'page' : undefined}
          className={`island-iconbtn nav-icononly collapsible${candActive ? ' active' : ''}`}>
          <Icon name="target" className="icon" />
          <span className="ibtn-label" aria-hidden="true">Featured</span>
        </Link>
        <button type="button" className="island-iconbtn collapsible" aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen} aria-controls={menuOpen ? 'menu-sheet' : undefined}
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}>
          <Icon name={menuOpen ? 'x' : 'menu'} className="icon" />
          <span className="ibtn-label" aria-hidden="true">Menu</span>
        </button>
      </div>
      {!bare && (
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
      )}
      <div className="island-body" data-open={menuOpen || undefined}>
        <div className="island-body-in">
          {menuOpen && (
            <nav id="menu-sheet" className="menu-sheet" aria-label="Views" data-closing={menuClosing || undefined}>
          {MENU.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => closeMenu()}
              aria-current={item.active ? 'page' : undefined}
              className={`menu-link${item.active ? ' active' : ''}`}>
              <Icon name={item.icon} className="icon" />
              <span className="menu-text">
                <span className="menu-label">{item.label}</span>
                <span className="menu-desc">{item.desc}</span>
              </span>
            </Link>
          ))}
          <div className="menu-div" role="separator" aria-hidden="true" />
          <SurpriseButton className="menu-link menu-action" onPick={surprisePick} desc="Open a random blink" />
          <a className="menu-link menu-action" href={appLink()} target="_blank" rel="noreferrer"
            title="Open the release builds page">
            <Icon name="dl" className="icon" />
            <span className="menu-text">
              <span className="menu-label">Get the app</span>
              <span className="menu-desc">Android · Linux · Windows builds</span>
            </span>
          </a>
        </nav>
          )}
        </div>
      </div>
    </div>
  );
}
