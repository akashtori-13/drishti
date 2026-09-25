'use client';

import { useEffect, useState } from 'react';
import { swr } from '@/lib/cachefirst';

interface PairTest {
  family: string;
  mjd0: number;
  mjd1: number;
  dA_sigma: number;
  dR_sigma: number;
  verdict: string;
}

interface PairDoc {
  pairs: Array<{ family: string; mjd: number }>;
  tests: PairTest[];
  quality_masked: Array<{ family: string; mjd: number; reason: string }>;
  pre_fix_caveat?: boolean;
}

const VERDICT_TONE: Record<string, string> = {
  'consistent-static': '#4fc9a8',
  'achromatic brightness change': '#e8c34a',
  'colour evolution': '#e08a4c',
  'brightness+colour evolution': '#e08a4c',
};

/** Cross-epoch pair verdicts from scripts/pairfit.py output.
 *  Renders nothing until /pairs/{pairId}.json exists. Text only —
 *  no scores, no gauges: verdict words plus the sigma distances. */
export default function PairVerdicts({ pairId, title }: {
  pairId: string; title: string;
}) {
  const [doc, setDoc] = useState<PairDoc | null>(null);
  useEffect(() => {
    let alive = true;
    void swr<PairDoc>(`sh-pair:${pairId}`, `/pairs/${pairId}.json`, Infinity)
      .then((r) => { if (alive && r?.data && Array.isArray(r.data.tests)) setDoc(r.data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [pairId]);
  if (!doc) return null;
  return (
    <div>
      <h3>{title}</h3>
      {doc.tests.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {doc.tests.map((t, i) => (
            <li key={i} style={{ fontSize: 12, color: '#c6cade', marginBottom: 6 }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 4,
                background: VERDICT_TONE[t.verdict] ?? '#8a90ab', marginRight: 8,
              }} />
              {t.family}: {t.verdict} (ΔA {t.dA_sigma}σ, ΔR {t.dR_sigma}σ)
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">No cross-epoch test yet — each pair family sampled once,
          or visits quality-masked.</p>
      )}
      {doc.quality_masked?.length ? (
        <p className="fine">{doc.quality_masked.length} visit
          {doc.quality_masked.length === 1 ? '' : 's'} excluded (core pixel masked).</p>
      ) : null}
    </div>
  );
}
