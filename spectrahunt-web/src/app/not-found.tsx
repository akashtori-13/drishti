'use client';

import Link from 'next/link';
import SiteChrome from '@/components/SiteChrome';
import { useAppStore } from '@/lib/store';

export default function NotFound() {
  const openPreview = useAppStore((s) => s.openPreview);
  return (
    <SiteChrome>
      <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="hero-kicker">404 · off the charted sky</p>
        <div style={{ fontSize: 64 }} aria-hidden="true">✦</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginTop: 16 }}>Lost in space</h1>
        <p style={{ color: 'var(--ink-2)', marginTop: 12 }}>No field at these coordinates. The sky is big — here are some visited ones:</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <Link href="/" className="btn primary">Home</Link>
          <Link href="/sky" className="btn">SkyMap</Link>
          <button type="button" className="btn" onClick={() => openPreview('3i-atlas')}>3I/ATLAS blink</button>
        </div>
      </div>
    </SiteChrome>
  );
}
