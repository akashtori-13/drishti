'use client';

import { useEffect, useState } from 'react';
import { swr } from '@/lib/cachefirst';

interface Ranked {
  target: string;
  max_dR: number;
  max_dA: number;
  best_family: string;
  best_verdict: string;
  n_tests: number;
  n_masked: number;
}

interface Unrated {
  target: string;
  reason: string;
  n_masked: number;
}

interface Board {
  rated: Ranked[];
  unrated: Unrated[];
}

/** Step-7 leaderboard: targets ranked by strongest colour signal, with
 *  UNRATED listed separately — never silently ranked as static. */
export default function RankingBoard() {
  const [doc, setDoc] = useState<Board | null>(null);
  useEffect(() => {
    let alive = true;
    void swr<Board>('sh-ranking', '/ranking.json', Infinity)
      .then((r) => { if (alive && r?.data && Array.isArray(r.data.rated)) setDoc(r.data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!doc || (!doc.rated.length && !doc.unrated.length)) return null;
  return (
    <div>
      <h3>Field ranking: colour variability</h3>
      {doc.rated.map((r, i) => (
        <p key={r.target} style={{ fontSize: 12, color: '#c6cade', margin: '0 0 6px' }}>
          {i + 1}. {r.target} — max ΔR {r.max_dR}σ ({r.best_family}, {r.best_verdict})
        </p>
      ))}
      {doc.unrated.map((r) => (
        <p key={r.target} style={{ fontSize: 12, color: '#8a90ab', margin: '0 0 6px' }}>
          · {r.target} — UNRATED ({r.reason})
        </p>
      ))}
      <p className="fine">Ranked by strongest cross-epoch colour signal. UNRATED means
        no clean test survived quality masking — not a detection of constancy.</p>
    </div>
  );
}
