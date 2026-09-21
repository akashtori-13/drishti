'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Icon from '@/components/Icon';
import SurpriseButton from '@/components/SurpriseButton';
import { blinkURL } from '@/lib/store';

const ITEMS = [
  { href: '/', label: 'Home', exact: true },
  { href: '/sky', label: 'Sky' },
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

/** Floating instrument dock: brand + views + surprise. No bar, no hamburger. */
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.title = TITLES[pathname] ?? (pathname.startsWith('/blink/') ? 'Blink — SpectraHunt' : 'SpectraHunt');
  }, [pathname]);

  const active = (href: string, match?: string, exact?: boolean) =>
    exact ? pathname === href : match !== undefined ? pathname.startsWith(match) : pathname === href;

  return (
    <nav className="dock glass" aria-label="Primary">
      <Link className="dock-brand" href="/" aria-label="SpectraHunt home">
        <Icon name="logo" className="logo icon" />
      </Link>
      {ITEMS.map((item) => {
        const on = active(item.href, item.match, item.exact);
        return (
          <Link
            key={item.href} href={item.href}
            className={on ? 'active' : undefined}
            aria-current={on ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <SurpriseButton
        compact
        className="dock-dice"
        onPick={(t) => {
          if (t.showcaseId) router.push(blinkURL(t.showcaseId));
          else router.push('/sky');
        }}
      />
    </nav>
  );
}
