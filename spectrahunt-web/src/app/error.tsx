'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import SiteChrome from '@/components/SiteChrome';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      console.error('route error:', error.message);
    } catch { /* noop */ }
  }, [error]);
  return (
    <SiteChrome>
      <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="hero-kicker">rendering fault · data is safe</p>
        <div style={{ fontSize: 64 }} aria-hidden="true">☄</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginTop: 16 }}>Something flared up</h1>
        <p style={{ color: 'var(--ink-2)', marginTop: 12 }}>This view failed to render. Your data is safe — try again or pick another field.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
          <Link href="/" className="btn">Home</Link>
        </div>
      </div>
    </SiteChrome>
  );
}
