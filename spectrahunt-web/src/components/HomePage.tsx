'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { blinkURL } from '@/lib/store';
import { SHOWCASE_IDS, getCoverage, getShowcase, useLive, type RealCell, type Showcase } from '@/lib/showcases';
import { BANDS, buildGrid, GRID_H, GRID_W } from '@/lib/sky';
import { CHANNELS } from '@/lib/astro';
import HeroSky from '@/components/HeroSky';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import Inspector, { type InspectorField } from '@/components/Inspector';

const SHOWCASE_POINTS = [
  { id: '3i-atlas', ra: 252.6633, dec: -17.4904 },
  { id: 'ecliptic-mover', ra: 180, dec: 0 },
  { id: 'nep-deep', ra: 270, dec: 66.5 },
  { id: 'orion-field', ra: 83.82, dec: -5.39 },
  { id: 'galactic-center', ra: 266.42, dec: -29.01 },
  { id: 'm31-field', ra: 10.68, dec: 41.27 },
  { id: 'lmc-field', ra: 80.89, dec: -69.76 },
  { id: 'virgo-field', ra: 200, dec: 0 },
  { id: 'eros-field', ra: 210.32, dec: 9.11 },
  { id: 'crab-field', ra: 83.63, dec: 22.01 },
  { id: 'omega-cen-field', ra: 201.69, dec: -47.48 },
  { id: 'carina-field', ra: 161.26, dec: -59.68 },
  { id: 'm51-field', ra: 202.47, dec: 47.2 },
  { id: 'm101-field', ra: 210.8, dec: 54.35 },
  { id: 'smc-field', ra: 13.18, dec: -72.83 },
];

function nearestShowcase(ra: number, dec: number): string | null {
  let best: string | null = null;
  let bestD = 3.0;
  for (const s of SHOWCASE_POINTS) {    const d = Math.hypot(s.ra - ra, s.dec - dec);
    if (d < bestD) { bestD = d; best = s.id; }
  }
  return best;
}

function fieldFromRaDec(ra: number, dec: number, grid: number[][], real?: Map<string, RealCell>): InspectorField {
  const i = Math.min(GRID_W - 1, Math.max(0, Math.floor((ra / 360) * GRID_W)));
  const j = Math.min(GRID_H - 1, Math.max(0, Math.floor(((90 - dec) / 180) * GRID_H)));
  const hit = real?.get(`${i},${j}`);
  if (hit) {
    return {
      ra, dec, epochs: hit.epochs,
      bands: hit.bands,
      survey: hit.showcase === 'nep-deep' ? 'Deep' : 'Wide',
      hasCandidate: hit.showcase === '3i-atlas',
      planning: 'QR2 · weekly releases',
      detector: 1 + (i + j) % 6,
      measured: true,
    };
  }
  return {
    ra, dec, epochs: 0, bands: 0, survey: '—',
    hasCandidate: false, planning: 'Not yet surveyed', detector: '—',
    measured: false,
  };
}

/** Rotating featured detections: real fields with ≥2 rendered cutouts. */
function FeaturedCycle({ fields }: { fields: Showcase[] }) {
  const cands = useMemo(
    () => fields.filter((f) => f.epochs.filter((e) => e.png).length >= 2).slice(0, 5),
    [fields],
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (cands.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % cands.length), 6000);
    return () => clearInterval(t);
  }, [cands, paused]);
  if (!cands.length) return null;
  const f = cands[Math.min(i, cands.length - 1)];
  const pngs = f.epochs.map((e) => e.png).filter(Boolean) as string[];
  const mjds = f.epochs.map((e) => e.mjd).filter((m): m is number => m !== undefined);
  const span = mjds.length >= 2 ? Math.round(Math.abs(mjds[mjds.length - 1] - mjds[0])) : null;
  return (
    <div
      className="featured-wrap"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link
        key={f.id}
        href={blinkURL(f.id, { mode: 'diff' })}
        className="featured"
        aria-label={`Featured real detection: ${f.title}`}
      >
        <span className="feat-imgs" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngs[0]} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pngs[1]} alt="" draggable={false} className="b" />
        </span>
        <span className="feat-body">
          <span className="feat-k">Real detection</span>
          <span className="feat-t">{f.title}</span>
          <span className="feat-s">
            Two SPHEREx visits{span !== null ? `, ${span} days apart` : ''}. The stars cancel out; the mover remains. →
          </span>
        </span>
      </Link>
      {cands.length > 1 && (
        <div className="feat-dots" role="group" aria-label="Featured fields">
          {cands.map((c, k) => (
            <button
              key={c.id} type="button" aria-label={`Show ${c.title}`}
              aria-pressed={k === Math.min(i, cands.length - 1)}
              className={`feat-dot${k === Math.min(i, cands.length - 1) ? ' active' : ''}`}
              onClick={() => { setI(k); setPaused(true); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {  const router = useRouter();
  const grid = useMemo(() => {
    const g = buildGrid();
    return g;
  }, []);
  const [coverage, setCoverage] = useState(false);
  const [field, setField] = useState<InspectorField | null>(null);
  const [real, setReal] = useState<Map<string, RealCell> | null>(null);
  const [fields, setFields] = useState<Showcase[]>([]);

  useEffect(() => {
    let alive = true;
    void getCoverage().then((c) => {
      if (!alive || !c) return;
      const m = new Map<string, RealCell>();
      for (const [k, v] of Object.entries(c.cells)) {
        m.set(k, v);
        const [i, j] = k.split(',').map(Number);
        if (Number.isInteger(i) && Number.isInteger(j)) grid[j][i] = Math.min(v.epochs, 5);
      }
      setReal(m);
    });
    void Promise.all(SHOWCASE_IDS.map((id) => getShowcase(id).catch(() => null))).then((docs) => {
      if (alive) setFields(docs.filter((d): d is Showcase => d !== null));
    });
    return () => { alive = false; };
  }, [grid]);

  // '/' focuses search anywhere on the page (unless typing already)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      e.preventDefault();
      document.getElementById('hs-input')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.5) setField(null);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pick = (t: SearchTarget) => {
    if (t.showcaseId) { router.push(blinkURL(t.showcaseId)); return; }
    setField(fieldFromRaDec(t.ra, t.dec, grid, real ?? undefined));
  };

  const cutouts = fields.flatMap((f) => f.epochs).filter((e) => e.png).length;

  return (
    <div>
      <section className="hero" id="hero">
        <HeroSky grid={grid} coverage={coverage}
          markers={SHOWCASE_POINTS}
          onMarker={(id) => router.push(blinkURL(id))}
          onInspect={(ra, dec) => setField(fieldFromRaDec(ra, dec, grid, real ?? undefined))} />
        <div className="hero-scrim" />

        <div className="hero-core">
          <h1>Hunt what moves in the infrared sky</h1>
          <p className="hero-sub">
            SPHEREx re-images the whole sky every six months. SpectraHunt shows what changed.
          </p>

          <SearchBox
            id="hs" placeholder="Search an object, field, or coordinates"
            onPick={pick}
          />

          <div className="quick">
            <button type="button" className="chip" onClick={() => router.push(blinkURL('3i-atlas'))}>3I/ATLAS</button>
            <button type="button" className="chip" onClick={() => pick({ label: '433 Eros', ra: 210.32, dec: 9.11 })}>433 Eros</button>
            <button type="button" className="chip" onClick={() => pick({ label: 'Orion Complex', ra: 83.82, dec: -5.39 })}>Orion Complex</button>
            <span className="quick-sep" aria-hidden="true">·</span>
            <SurpriseButton onPick={pick} />
          </div>

          <FeaturedCycle fields={fields} />
          <p className="credit-line">Built on public SPHEREx Quick Release 2 data (NASA/IPAC).</p>
        </div>
      </section>

      <section className="fields" id="fields" aria-labelledby="fields-h">
        <div className="fields-inner">
          <div className="fields-head">
            <div>
              <h2 id="fields-h">{SHOWCASE_IDS.length} fields, ready to blink</h2>
              <p>Every card is real SPHEREx data — two or more visits, same band. Pick one and press play.</p>
            </div>
            <Link href="/sky" className="btn">Open the sky map</Link>
          </div>
          <div className="fields-rail" role="list">
            {fields.map((f) => {
              const png = f.epochs.find((e) => e.png)?.png ?? null;
              return (
                <Link key={f.id} href={blinkURL(f.id)} className="field-card" role="listitem"
                  aria-label={`${f.title}, ${f.epochs.length} epochs`}>
                  <span className="field-thumb">
                    {png ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={png} alt="" loading="lazy" draggable={false} />
                    ) : (
                      <span className="field-pending">cutout pending</span>
                    )}
                    <span className="field-epochs mono">{f.epochs.length} epochs</span>
                  </span>
                  <span className="field-body">
                    <span className="field-name">{f.title}</span>
                    <span className="field-meta mono">D{f.epochs[0]?.band ?? 3} · {f.epochs[0]?.wavelength_um?.toFixed(2) ?? '—'} µm</span>
                  </span>
                </Link>
              );
            })}
            {!fields.length && (
              <p className="empty">Loading fields…</p>
            )}
          </div>
        </div>
      </section>

      <section className="nums" aria-label="By the numbers">
        <div className="nums-inner">
          <div className="num">
            <span className="num-n">{real ? real.size.toLocaleString() : '—'}</span>
            <span className="num-l">sky cells measured</span>
          </div>
          <div className="num">
            <span className="num-n">{fields.length ? String(cutouts) : '—'}</span>
            <span className="num-l">epoch cutouts rendered</span>
          </div>
          <div className="num">
            <span className="num-n">{CHANNELS.length}</span>
            <span className="num-l">spectral bands, 0.75–5 µm</span>
          </div>
          <div className="num">
            <span className="num-n">{BANDS.length}</span>
            <span className="num-l">detectors, same-band blinks</span>
          </div>
        </div>
      </section>

      <section className="how" id="how" aria-labelledby="how-h">
        <div className="how-inner">
          <h2 id="how-h">How SpectraHunt spots something that moves</h2>
          <p className="how-lead">Every field is compared with itself across visits. Stars stay put. Anything else shows up in the difference.</p>

          <ol className="steps">
            <li>
              <figure className="step-fig">
                <svg viewBox="0 0 240 150" role="img" aria-label="Two sets of stars, offset slightly, being lined up">
                  <g fill="#dfe3f2"><circle cx="40" cy="40" r="3" /><circle cx="90" cy="98" r="2.2" /><circle cx="150" cy="52" r="3.2" /><circle cx="196" cy="112" r="2.4" /><circle cx="122" cy="26" r="1.8" /><circle cx="62" cy="118" r="2.6" /></g>
                  <g fill="none" stroke="#5aa9e6" strokeWidth="1.4"><circle cx="49" cy="46" r="4.6" /><circle cx="99" cy="104" r="4" /><circle cx="159" cy="58" r="4.8" /><circle cx="205" cy="118" r="4.2" /><circle cx="131" cy="32" r="3.6" /><circle cx="71" cy="124" r="4.4" /></g>
                  <g stroke="rgba(238,240,248,.3)" strokeWidth="1" strokeDasharray="2 3"><path d="M43 42l3 2M92 100l4 3M153 54l4 3M198 113l4 3M124 28l4 3M65 120l4 3" /></g>
                </svg>
              </figure>
              <div className="step-head"><span className="step-n">1</span><h3>Align the passes</h3></div>
              <p>Each visit to a field is registered to a common pixel grid and background-subtracted.</p>
            </li>
            <li>
              <figure className="step-fig">
                <svg viewBox="0 0 240 150" role="img" aria-label="Faded stars with one bright spot paired with a dark spot">
                  <g fill="#dfe3f2" opacity=".16"><circle cx="40" cy="40" r="3" /><circle cx="90" cy="98" r="2.2" /><circle cx="150" cy="52" r="3.2" /><circle cx="196" cy="112" r="2.4" /><circle cx="62" cy="118" r="2.6" /></g>
                  <circle cx="146" cy="70" r="16" fill="#f08a4b" opacity=".22" />
                  <circle cx="146" cy="70" r="5.5" fill="#fff" />
                  <circle cx="102" cy="88" r="5.5" fill="#04050a" stroke="rgba(238,240,248,.6)" strokeWidth="1.4" strokeDasharray="3 3" />
                  <path d="M110 85l28-12" stroke="rgba(238,240,248,.4)" strokeWidth="1.2" strokeDasharray="2 4" />
                </svg>
              </figure>
              <div className="step-head"><span className="step-n">2</span><h3>Subtract one from the other</h3></div>
              <p>Stationary stars cancel out. A mover leaves a paired bright and dark spot: where it is, and where it was.</p>
            </li>
            <li>
              <figure className="step-fig">
                <svg viewBox="0 0 240 150" role="img" aria-label="A bright dot inside a dashed circle marking a catalog match radius">
                  <g fill="#dfe3f2" opacity=".16"><circle cx="40" cy="40" r="3" /><circle cx="190" cy="34" r="2.2" /><circle cx="200" cy="112" r="3" /><circle cx="52" cy="112" r="2.4" /></g>
                  <circle cx="120" cy="75" r="15" fill="#f08a4b" opacity=".22" />
                  <circle cx="120" cy="75" r="5" fill="#fff" />
                  <circle cx="120" cy="75" r="26" fill="none" stroke="#5fcf9a" strokeWidth="1.4" strokeDasharray="4 4" />
                  <path d="M120 40v9M120 101v9M85 75h9M146 75h9" stroke="rgba(238,240,248,.55)" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </figure>
              <div className="step-head"><span className="step-n">3</span><h3>Check the catalogs</h3></div>
              <p>Every candidate is cross-matched against Gaia stars and known solar-system objects. Anything without a match goes to a person for review.</p>
            </li>
          </ol>

          <div className="how-cta">
            <button type="button" className="btn primary" onClick={() => router.push('/sky')}>Open the sky map</button>
            <button type="button" className="btn" onClick={() => router.push('/candidates')}>See this week&apos;s candidates</button>
          </div>
        </div>
      </section>

      <Inspector
        field={field} blinkId={field ? (nearestShowcase(field.ra, field.dec) ?? (useLive && field.epochs >= 2 ? 'live' : null)) : null}
        onClose={() => setField(null)}
        onOpenBlink={() => {
          if (field) {
            const id = nearestShowcase(field.ra, field.dec);
            if (id) router.push(blinkURL(id));
            else if (useLive && field.epochs >= 2) router.push(`/blink/live?ra=${field.ra.toFixed(3)}&dec=${field.dec.toFixed(3)}&band=3`);
          }
          setField(null);
        }}
      />
    </div>
  );
}
