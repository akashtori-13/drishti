'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { SHOWCASE_IDS } from '@/lib/showcases';
import { buildGrid, pinCells, GRID_H, GRID_W } from '@/lib/sky';
import HeroSky from '@/components/HeroSky';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import Inspector, { type InspectorField } from '@/components/Inspector';

const SHOWCASE_POINTS = [
  { id: '3i-atlas', ra: 252.6633, dec: -17.4904 },
  { id: 'ecliptic-mover', ra: 180, dec: 0 },
  { id: 'nep-deep', ra: 270, dec: 66.5 },
];

function nearestShowcase(ra: number, dec: number): string | null {
  let best: string | null = null;
  let bestD = 3.0;
  for (const s of SHOWCASE_POINTS) {
    const d = Math.hypot(s.ra - ra, s.dec - dec);
    if (d < bestD) { bestD = d; best = s.id; }
  }
  return best;
}

function fieldFromRaDec(ra: number, dec: number, grid: number[][]): InspectorField {
  const i = Math.min(GRID_W - 1, Math.max(0, Math.floor((ra / 360) * GRID_W)));
  const j = Math.min(GRID_H - 1, Math.max(0, Math.floor(((90 - dec) / 180) * GRID_H)));
  const n = grid[j][i];
  const seed = 500 + i * 100 + j;
  return {
    ra, dec, epochs: n,
    bands: n === 0 ? 0 : 3 + (seed % 4),
    survey: seed % 5 === 0 ? 'Deep' : 'Wide',
    hasCandidate: n >= 2 && seed % 3 === 0,
    planning: `2026W${10 + Math.max(1, n) * 3}_2B`,
    detector: 1 + (seed % 6),
  };
}

export default function HomePage() {
  const { openShowcase, setCurrentView } = useAppStore();
  const grid = useMemo(() => {
    const g = buildGrid();
    pinCells(g, SHOWCASE_POINTS);
    return g;
  }, []);
  const [coverage, setCoverage] = useState(false);
  const [field, setField] = useState<InspectorField | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.5) setField(null);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pick = (t: SearchTarget) => {
    if (t.showcaseId) { openShowcase(t.showcaseId); return; }
    setField(fieldFromRaDec(t.ra, t.dec, grid));
  };

  return (
    <div>
      <section className="hero" id="hero">
        <HeroSky grid={grid} coverage={coverage} onInspect={(ra, dec) => setField(fieldFromRaDec(ra, dec, grid))} />
        <div className="hero-scrim" />

        <div className="hero-core">
          <h1>Hunt what moves in the infrared sky</h1>
          <p className="hero-sub">
            SPHEREx scans the whole sky every six months. SpectraHunt lines up each pass
            and flags what changed: comets, asteroids, variable stars.
          </p>

          <SearchBox
            id="hs" placeholder="Search an object or coordinates"
            onPick={pick}
          />

          <div className="quick">
            <span className="quick-label">Try</span>
            <button type="button" className="chip" onClick={() => openShowcase('3i-atlas')}>3I/ATLAS</button>
            <button type="button" className="chip" onClick={() => pick({ label: '433 Eros', ra: 210.32, dec: 9.11 })}>433 Eros</button>
            <button type="button" className="chip" onClick={() => pick({ label: 'Orion Complex', ra: 83.82, dec: -5.39 })}>Orion Complex</button>
            <button type="button" className="chip mono" onClick={() => pick({ label: '156.09, −41.64', ra: 156.09, dec: -41.64 })}>156.09, −41.64</button>
          </div>
          <p className="sky-hint">Or click anywhere on the sky to inspect that field.</p>
        </div>

        <div className="hero-foot">
          <div className="pill glass">
            <span id="heroCovLabel">Coverage overlay</span>
            <button
              type="button" className="switch" role="switch" aria-checked={coverage}
              aria-labelledby="heroCovLabel" onClick={() => setCoverage((c) => !c)}
            />
          </div>
        </div>
      </section>

      <div className="home-info-bar">
        <div className="pill glass">
          <span className="rel"><span className="live-dot" />QR2 release, updated weekly</span>
          <span className="sep rel" aria-hidden="true" />
          <span><b>{(GRID_W * GRID_H).toLocaleString('en-US')}</b> fields indexed</span>
          <span className="sep" aria-hidden="true" />
          <span><b>{SHOWCASE_IDS.length}</b> showcases live</span>
        </div>
      </div>

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
              <p>Every candidate is cross-matched against SkyBoT&apos;s known solar-system objects. Anything without a match goes to a person for review.</p>
            </li>
          </ol>

          <div className="how-cta">
            <button type="button" className="btn primary" onClick={() => setCurrentView('sky')}>Open the sky map</button>
            <button type="button" className="btn" onClick={() => setCurrentView('candidates')}>See this week&apos;s candidates</button>
          </div>
        </div>
      </section>

      <Inspector
        field={field} blinkId={field ? nearestShowcase(field.ra, field.dec) : null}
        onClose={() => setField(null)}
        onOpenBlink={() => {
          if (field) {
            const id = nearestShowcase(field.ra, field.dec);
            if (id) openShowcase(id);
          }
          setField(null);
        }}
      />
    </div>
  );
}
