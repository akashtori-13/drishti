'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { randomBlinkable } from '@/lib/showcases';
import { surpriseField } from '@/lib/catalogs';
import type { SearchTarget } from '@/components/SearchBox';

/**
 * Serendipity entry point: rolls a random *blinkable* field and hands the
 * caller a ready-to-open blink target — fields without rendered epochs are
 * skipped roll-side, so the dice never strands the user on an inspector
 * waiting for a second "open blink" click.
 */
export default function SurpriseButton({
  onPick, compact = false, className = 'chip lucky', label, desc,
}: {
  onPick: (t: SearchTarget) => void;
  compact?: boolean;
  className?: string;
  /** Optional always-visible label (e.g. inside the expanded island). */
  label?: string;
  /** Optional sub-label shown under the label in menu-row layouts. */
  desc?: string;
}) {
  const pathname = usePathname();
  const [rolling, setRolling] = useState(false);

  const surprise = () => {
    if (rolling) return;
    setRolling(true);
    // don't re-roll the blink we're already standing on
    const here = pathname.match(/^\/blink\/([^/]+)/)?.[1] ?? null;
    const stop = () => setRolling(false);
    void randomBlinkable(here ? decodeURIComponent(here) : null)
      .then((d) => {
        if (d) {
          // blinkable by construction: every onPick handler routes a
          // showcaseId straight to its blink page, no second click needed
          onPick({ label: d.title, ra: d.ra, dec: d.dec, showcaseId: d.id });
        } else {
          // offline with an empty cache: legacy fallback to a curated sky target
          const s = surpriseField();
          onPick(s.showcaseId
            ? { label: s.title, ra: s.ra, dec: s.dec, showcaseId: s.showcaseId }
            : { label: s.title, ra: s.ra, dec: s.dec });
        }
      })
      .catch(() => {
        const s = surpriseField();
        onPick({ label: s.title, ra: s.ra, dec: s.dec });
      })
      .finally(stop);
  };
  return (
    <button type="button" className={className} onClick={surprise}
      disabled={rolling} aria-busy={rolling}
      title="Roll a random field and open its blink" aria-label="Surprise me: open a random blink">
      <Icon name="dice" className="icon" />
      {!compact && (
        <span className="menu-text">
          <span className="menu-label">{rolling ? 'Rolling…' : 'Surprise me'}</span>
          {desc && <span className="menu-desc">{desc}</span>}
        </span>
      )}
      {compact && label && <span className="ibtn-label" aria-hidden="true">{label}</span>}
    </button>
  );
}
