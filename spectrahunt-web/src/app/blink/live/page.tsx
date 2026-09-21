'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import SiteChrome from '@/components/SiteChrome';
import BlinkPage from '@/components/BlinkPage';
import { liveIdFor } from '@/lib/showcases';

function LiveBlink() {
  const q = useSearchParams();
  const ra = parseFloat(q.get('ra') ?? '');
  const dec = parseFloat(q.get('dec') ?? '');
  const band = parseInt(q.get('band') ?? '3', 10);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    return (
      <SiteChrome>
        <div className="blink-layout">
          <h1 className="field-title">Live field needs coordinates</h1>
          <p className="field-sub">Open any map point and choose “Blink this field”. Example: <Link href="/blink/live?ra=180&dec=0&band=3">/blink/live?ra=180&amp;dec=0&amp;band=3</Link></p>
        </div>
      </SiteChrome>
    );
  }
  return (
    <SiteChrome>
      <BlinkPage id={liveIdFor(ra, dec, band >= 1 && band <= 6 ? band : 3)} />
    </SiteChrome>
  );
}

export default function LiveBlinkPage() {
  return (
    <Suspense fallback={<SiteChrome><div className="blink-layout"><p className="field-sub">Loading live field…</p></div></SiteChrome>}>
      <LiveBlink />
    </Suspense>
  );
}
