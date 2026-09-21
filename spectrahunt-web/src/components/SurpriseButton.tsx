'use client';

import Icon from '@/components/Icon';
import { getShowcase } from '@/lib/showcases';
import { surpriseField } from '@/lib/catalogs';
import type { SearchTarget } from '@/components/SearchBox';

/** Serendipity entry point: jumps to a pre-curated interesting field. */
export default function SurpriseButton({
  onPick, compact = false, className = 'chip lucky',
}: {
  onPick: (t: SearchTarget) => void;
  compact?: boolean;
  className?: string;
}) {
  const surprise = () => {
    const s = surpriseField();
    if (s.showcaseId) {
      void getShowcase(s.showcaseId)
        .then((d) => onPick({ label: d.title, ra: d.ra, dec: d.dec, showcaseId: s.showcaseId }))
        .catch(() => onPick({ label: s.title, ra: s.ra, dec: s.dec }));
    } else {
      onPick({ label: s.title, ra: s.ra, dec: s.dec });
    }
  };
  return (
    <button type="button" className={className} onClick={surprise}
      title="Jump to a pre-curated interesting field" aria-label="Surprise me: jump to a random interesting field">
      <Icon name="dice" className="icon" />
      {!compact && <span>Surprise me</span>}
    </button>
  );
}
