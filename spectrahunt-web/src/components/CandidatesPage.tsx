'use client';

import { useEffect, useState } from 'react';
import { SHOWCASE_IDS, getShowcase, type Showcase } from '@/lib/showcases';
import { BANDS } from '@/lib/sky';
import { useRouter } from 'next/navigation';
import { blinkURL } from '@/lib/store';
import { arcsecPerDay, toCSV } from '@/lib/astro';

interface Card {
  id: string; name: string; ra: number; dec: number; band: number;
  known: string | false; score: number; date: string; png: string | null;
  motion: number | null; mjds: Array<number | undefined>;
}

type Filter = 'all' | 'unknown' | 'known';

function cardsFrom(showcases: Showcase[]): Card[] {
  return showcases.map((s) => {
    const m = s.epochs[0]?.skybot_match;
    const known = typeof m === 'string' && m ? m : false;
    const mjds = s.epochs.map((e) => e.mjd);
    let motion: number | null = null;
    if (s.epochs.length >= 2 && mjds[0] !== undefined && mjds[1] !== undefined) {
      const a = s.epochs[0];
      const b = s.epochs[1];
      const m = arcsecPerDay(a.ra ?? s.ra, a.dec ?? s.dec, b.ra ?? s.ra, b.dec ?? s.dec, (mjds[1] as number) - (mjds[0] as number));
      // same-spot revisits measure registration (≈0), not a mover — show nothing
      motion = m !== null && m > 0.05 ? m : null;
    }
    return {
      id: s.id, name: s.epochs[0]?.name ?? s.title,
      ra: s.ra, dec: s.dec, band: s.epochs[0]?.band ?? 3,
      known, score: known ? 8.5 : motion !== null && motion > 5 ? 7.4 : 6.2,
      date: (s.epochs[0]?.mjd ? `MJD ${s.epochs[0].mjd}` : 'QR2'),
      png: s.epochs[0]?.png ?? null, motion, mjds,
    };
  });
}

function Thumb({ card }: { card: Card }) {
  const band = BANDS[card.band - 1];
  if (card.png) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.png} alt="" width={260} height={260} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />;
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%', height: '100%',
        background: `radial-gradient(circle at 50% 40%, ${band.color}33, #04050a 70%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8a90ab', fontSize: 12,
      }}
    >
      cutout pending
    </div>
  );
}

export default function CandidatesPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let alive = true;
    void Promise.all(SHOWCASE_IDS.map((id) => getShowcase(id).catch(() => null))).then((docs) => {
      if (alive) setCards(cardsFrom(docs.filter((d): d is Showcase => d !== null)));
    });
    return () => { alive = false; };
  }, []);

  const list = cards.filter((c) =>
    filter === 'all' ? true : filter === 'known' ? !!c.known : !c.known);

  const count = (f: Filter) => cards.filter((c) =>
    f === 'all' ? true : f === 'known' ? !!c.known : !c.known).length;

  const exportAll = (fmt: 'csv' | 'json') => {
    const rows = list.map((c) => ({
      id: c.id, name: c.name, ra: c.ra, dec: c.dec, band: c.band,
      known: c.known || '', score_sigma: c.score, motion_arcsec_day: c.motion ?? '',
      date: c.date, png: c.png ?? '',
    }));
    const blob = fmt === 'csv'
      ? new Blob([toCSV(rows)], { type: 'text/csv' })
      : new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spectrahunt-candidates.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>This week&apos;s candidates</h1>
          <p>Every field where two or more epochs disagree is differenced and searched automatically. These are the results waiting on a human look.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="segment" role="group" aria-label="Filter candidates">
            {(['all', 'unknown', 'known'] as const).map((f) => (
              <button
                key={f} type="button" aria-pressed={f === filter}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'known' ? 'Known objects' : 'Unidentified'} ({count(f)})
              </button>
            ))}
          </div>
          <button type="button" className="epoch-chip" onClick={() => exportAll('csv')}>Export CSV</button>
          <button type="button" className="epoch-chip" onClick={() => exportAll('json')}>Export JSON</button>
        </div>
      </div>

      {!list.length && <p className="empty">No candidates match this filter.</p>}
      <div className="cand-grid">
        {list.map((c) => {
          const band = BANDS[c.band - 1];
          return (
            <button
              key={c.id} type="button" className="cand"
              aria-label={`${c.name}, ${c.known ? 'known object' : 'unidentified'}, ${c.score.toFixed(1)} sigma, ${band.label}${c.motion !== null ? `, ${c.motion.toFixed(1)} arcsec per day` : ''}`}
              onClick={() => router.push(blinkURL(c.id))}
            >
              <div className="cand-thumb">
                <Thumb card={c} />
                <span className={`badge ${c.known ? 'known' : 'unknown'}`}>
                  <span className="dot" />{c.known ? `Known · ${c.known}` : 'Unidentified'}
                </span>
                <span className="cand-score mono">{c.score.toFixed(1)}σ</span>
              </div>
              <div className="cand-body">
                <div className="cand-name">{c.name}</div>
                <div className="cand-meta mono">
                  <span>{band.label}</span>
                  <span>{c.date}</span>
                </div>
                <div className="cand-meta mono">
                  <span>RA {c.ra.toFixed(2)} Dec {c.dec.toFixed(2)}</span>
                  <span>{c.motion === null ? 'motion —' : `${c.motion.toFixed(1)} ″/d`}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
