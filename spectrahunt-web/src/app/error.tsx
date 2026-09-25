'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Last-resort boundary: a render throw can never blank the whole window. */
export default function Error({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error('[drishti] route error:', error.message);
    } catch { /* noop */ }
  }, [error]);
  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24,
      background: '#05060c', color: '#eef0f8', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 420 }}>
        <p style={{ fontSize: 12, color: '#8a90ab', letterSpacing: '.14em' }}>OFF THE CHARTED SKY</p>
        <h1 style={{ fontSize: 28, margin: '8px 0' }}>Something failed to render</h1>
        <p style={{ color: '#aab0c8', lineHeight: 1.6 }}>
          The sky is still there. Try again, or head home — cached fields work offline.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
          <Link className="btn" href="/">Home</Link>
        </div>
      </div>
    </div>
  );
}
