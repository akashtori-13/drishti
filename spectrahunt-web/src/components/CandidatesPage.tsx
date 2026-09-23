'use client';

import { useEffect, useRef, useState } from 'react';
import { SHOWCASE_IDS, getShowcase, type Showcase } from '@/lib/showcases';
import { BANDS } from '@/lib/sky';
import { useAppStore } from '@/lib/store';
import { arcsecPerDay, toCSV } from '@/lib/astro';

interface ReportObject {
  kind: string; sigma: number; x: number; y: number; label: string | null;
}

interface Report {
  id: string;
  movers: number; variables: number; top_sigma: number;
  span_days: number | null; variable_flag: boolean;
  known: { name: string; kind: string } | null;
  detail: string;
  objects?: ReportObject[];
}

type Kind = 'known' | 'mover' | 'variable' | 'unidentified' | 'pending';

interface Card {
  id: string; name: string; ra: number; dec: number; band: number;
  kind: Kind; knownName: string;
  stat: string; date: string; png: string | null;
  motion: number | null; mjds: Array<number | undefined>;
  objects: ReportObject[];
}

type Filter = 'all' | 'unknown' | 'known';

async function getReport(id: string): Promise<Report | null> {
  try {
    const r = await fetch(`/reports/${id}.json`);
    if (!r.ok) return null;
    return (await r.json()) as Report;
  } catch {
    return null;
  }
}

function cardsFrom(showcases: Showcase[], reports: Map<string, Report>): Card[] {
  const cards = showcases.map((s) => {
    const rep = reports.get(s.id);
    const mjds = s.epochs.map((e) => e.mjd);
    let motion: number | null = null;
    if (s.epochs.length >= 2 && mjds[0] !== undefined && mjds[1] !== undefined) {
      const a = s.epochs[0];
      const b = s.epochs[1];
      const m = arcsecPerDay(a.ra ?? s.ra, a.dec ?? s.dec, b.ra ?? s.ra, b.dec ?? s.dec, (mjds[1] as number) - (mjds[0] as number));
      // same-spot revisits measure registration (≈0), not a mover — show nothing
      motion = m !== null && m > 0.05 ? m : null;
    }
    let kind: Kind = 'pending';
    let knownName = '';
    let stat = 'not yet measured';
    if (rep && rep.detail === 'ok') {
      if (rep.known) { kind = 'known'; knownName = rep.known.name; }
      else if (rep.movers > 0) kind = 'mover';
      else if (rep.variables > 0 || rep.variable_flag) kind = 'variable';
      else kind = 'unidentified';
      const bits = [`top ${rep.top_sigma.toFixed(1)}σ`];
      if (rep.span_days !== null) bits.push(`${Math.round(rep.span_days)}d baseline`);
      stat = bits.join(' · ');
    } else if (!rep) {
      kind = 'unidentified';
    }
    return {
      id: s.id, name: s.epochs[0]?.name ?? s.title,
      ra: s.ra, dec: s.dec, band: s.epochs[0]?.band ?? 3,
      kind, knownName, stat,
      date: (s.epochs[0]?.mjd ? `MJD ${s.epochs[0].mjd}` : 'QR2'),
      png: s.epochs[0]?.png ?? null, motion, mjds,
      objects: rep?.objects ?? [],
    };
  });
  const rank: Record<Kind, number> = { known: 0, mover: 1, variable: 2, unidentified: 3, pending: 4 };
  return cards.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

const KIND_LABEL: Record<Kind, string> = {
  known: 'Known', mover: 'Mover candidate', variable: 'Variable candidate',
  unidentified: 'Unidentified', pending: 'Queued',
};

function Thumb({ card }: { card: Card }) {
  const band = BANDS[card.band - 1];
  const [broken, setBroken] = useState(false);
  // reset when the card's image changes (navigation, revalidation swap-in)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBroken(false);
  }, [card.png]);
  if (card.png && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.png} alt="" width={260} height={260} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} onError={() => setBroken(true)} />;
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
      {card.png ? 'image failed to load' : 'cutout pending'}
    </div>
  );
}

export default function CandidatesPage() {
  const openPreview = useAppStore((s) => s.openPreview);
  const [cards, setCards] = useState<Card[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const docsRef = useRef(new Map<string, Showcase>());
  const repsRef = useRef(new Map<string, Report>());

  useEffect(() => {
    let alive = true;
    void Promise.all([
      Promise.all(SHOWCASE_IDS.map((id) => getShowcase(id).catch(() => null))),
      Promise.all(SHOWCASE_IDS.map((id) => getReport(id))),
    ]).then(([docs, reps]) => {
      if (!alive) return;
      const map = new Map<string, Report>();
      for (const r of reps) if (r) map.set(r.id, r);
      docsRef.current = new Map(docs.filter((d): d is Showcase => d !== null).map((d) => [d.id, d]));
      repsRef.current = map;
      setCards(cardsFrom([...docsRef.current.values()], map));
    });
    // Background revalidation: getShowcase() serves stale instantly and refreshes
    // behind. Fresh arrivals (e.g. newly indexed PNGs) update the card in place.
    const onRevalidate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string; data?: Showcase } | undefined;
      if (!detail?.key?.startsWith('sh-showcase:') || !detail?.data) return;
      const fresh = detail.data;
      if (!(SHOWCASE_IDS as readonly string[]).includes(fresh.id)) return;
      const prev = docsRef.current.get(fresh.id);
      try {
        if (prev && JSON.stringify(prev) === JSON.stringify(fresh)) return;
      } catch { /* fall through and swap */ }
      docsRef.current.set(fresh.id, fresh);
      if (!alive) return;
      setCards(cardsFrom([...docsRef.current.values()], repsRef.current));
    };
    window.addEventListener('sh-revalidate', onRevalidate);
    return () => { alive = false; window.removeEventListener('sh-revalidate', onRevalidate); };
  }, []);

  const list = cards.filter((c) =>
    filter === 'all' ? true : filter === 'known' ? c.kind === 'known' : c.kind !== 'known');

  const count = (f: Filter) => cards.filter((c) =>
    f === 'all' ? true : f === 'known' ? c.kind === 'known' : c.kind !== 'known').length;

  const exportAll = (fmt: 'csv' | 'json') => {
    const rows = list.map((c) => ({
      id: c.id, name: c.name, ra: c.ra, dec: c.dec, band: c.band,
      kind: c.kind, known: c.knownName || '', measurement: c.stat,
      date: c.date, png: c.png ?? '',
    }));
    const blob = fmt === 'csv'
      ? new Blob([toCSV(rows)], { type: 'text/csv' })
      : new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stellar-candidates.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="hero-kicker">Measured fields · sorted by significance</p>
          <h1>Candidate fields</h1>
          <p>Curated SPHEREx fields, each measured by the detection pipeline (aligned difference, dipole significance, light curves). Kinds come from real numbers — or honest “unidentified”.</p>
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
          const open = openId === c.id;
          return (
            <div key={c.id} className="cand-wrap">
            <button
              type="button" className="cand"
              aria-label={`${c.name}, ${KIND_LABEL[c.kind]}, ${c.stat}, ${band.label}`}
              onClick={() => openPreview(c.id)}
            >
              <div className="cand-thumb">
                <Thumb card={c} />
                <span className="cand-badges">
                  <span className={`badge ${c.kind === 'known' ? 'known' : c.kind === 'pending' ? '' : 'unknown'}`}>
                    <span className="dot" />{c.kind === 'known' && c.knownName ? `Known · ${c.knownName}` : KIND_LABEL[c.kind]}
                  </span>
                  <span className="cand-score mono">{c.stat}</span>
                </span>
              </div>
              <div className="cand-body">
                <div className="cand-name">{c.name}</div>
                <div className="cand-meta mono"><span>{band.label}</span><span>{c.date}</span></div>
                <div className="cand-meta mono">
                  <span>RA {c.ra.toFixed(2)} Dec {c.dec.toFixed(2)}</span>
                  <span>{c.motion === null ? 'motion —' : `${c.motion.toFixed(1)} ″/d`}</span>
                </div>
              </div>
            </button>
            {c.objects.length > 0 && (
              <>
                <button
                  type="button" className="epoch-chip cand-objects-toggle" aria-expanded={open}
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  {open ? 'Hide objects' : `Objects (${c.objects.length})`}
                </button>
                {open && (
                  <ul className="cand-objects" aria-label={`Measured objects in ${c.name}`}>
                    {c.objects.map((o, i) => (
                      <li key={i} className="mono">
                        <span className={o.kind === 'mover' ? 'tag-mover' : 'tag-var'}>
                          {o.kind === 'mover' ? 'MOVER' : 'VARIABLE'}
                        </span>{' '}
                        #{i + 1} · {o.sigma.toFixed(1)}σ · x={o.x} y={o.y}
                        {o.label && o.label !== 'Unidentified – possible discovery' ? ` · ${o.label}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
