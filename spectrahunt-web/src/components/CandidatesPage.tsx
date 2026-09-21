'use client';

import { useEffect, useRef, useState } from 'react';
import { SHOWCASE_IDS, getShowcase, type Showcase } from '@/lib/showcases';
import { BANDS, genStars, hexToRgba, TAU } from '@/lib/sky';
import { useAppStore } from '@/lib/store';

interface Card {
  id: string; name: string; ra: number; dec: number; band: number;
  known: string | false; score: number; date: string; seed: number;
}

type Filter = 'all' | 'unknown' | 'known';

function cardsFrom(showcases: Showcase[]): Card[] {
  return showcases.map((s, i) => {
    const m = s.epochs[0]?.skybot_match;
    const known = typeof m === 'string' && m ? m : false;
    return {
      id: s.id, name: s.epochs[0]?.name ?? s.title,
      ra: s.ra, dec: s.dec, band: s.epochs[0]?.band ?? 3,
      known, score: known ? 8.5 + (i % 3) : 5.0 + (i % 5),
      date: (s.epochs[0]?.mjd ? `MJD ${s.epochs[0].mjd}` : 'QR2'),
      seed: 5000 + i * 131,
    };
  });
}

function Thumb({ card }: { card: Card }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const band = BANDS[card.band - 1];
    const stars = genStars(card.seed, 30);
    const mi = Math.floor(((card.seed * 0.618) % 1) * stars.length);
    let flip = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const draw = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#040509';
      ctx.fillRect(0, 0, 260, 260);
      ctx.globalCompositeOperation = 'lighter';
      stars.forEach((s, i) => {
        let x = s.x * 260;
        let y = s.y * 260;
        if (i === mi && flip === 1) { x += 12; y -= 8; }
        ctx.beginPath();
        ctx.fillStyle = i === mi ? hexToRgba(band.color, 0.95) : `rgba(230,231,239,${s.b})`;
        ctx.arc(x, y, i === mi ? s.r * 1.5 : s.r, 0, TAU);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      flip = 1 - flip;
    };
    draw();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = setInterval(draw, 900);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [card]);
  return <canvas ref={ref} width={260} height={260} aria-hidden="true" />;
}

export default function CandidatesPage() {
  const { openShowcase } = useAppStore();
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>This week&apos;s candidates</h1>
          <p>Every field where two or more epochs disagree is differenced and searched automatically. These are the results waiting on a human look.</p>
        </div>
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
      </div>

      {!list.length && <p className="empty">No candidates match this filter.</p>}
      <div className="cand-grid">
        {list.map((c) => {
          const band = BANDS[c.band - 1];
          return (
            <button
              key={c.id} type="button" className="cand"
              aria-label={`${c.name}, ${c.known ? 'known object' : 'unidentified'}, ${c.score.toFixed(1)} sigma, ${band.label}`}
              onClick={() => openShowcase(c.id)}
            >
              <div className="cand-thumb">
                <Thumb card={c} />
                <span className={`badge ${c.known ? 'known' : 'unknown'}`}>
                  <span className="dot" />{c.known ? 'Known' : 'Unidentified'}
                </span>
                <span className="cand-score mono">{c.score.toFixed(1)}σ</span>
              </div>
              <div className="cand-body">
                <div className="cand-name">{c.name}</div>
                <div className="cand-meta mono"><span>{band.label}</span><span>{c.date}</span></div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
