'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { blinkURL } from '@/lib/store';
import { LEVEL_COLORS } from '@/lib/sky';
import { buildGrid, GRID_H, GRID_W } from '@/lib/sky';
import { getCoverage, type RealCell } from '@/lib/showcases';
import CoverageMap, { type MapSelection } from '@/components/CoverageMap';
import StellariumView, { type StelFocus } from '@/components/StellariumView';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import Inspector, { type InspectorField } from '@/components/Inspector';
import type { SkyHover } from '@/components/HeroSky';
import { fmtDec, fmtRa } from '@/lib/sky';
import { useLive } from '@/lib/showcases';

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
  { id: 'dorado-deep', ra: 92.5, dec: -57.5 },
  { id: 'draco-field', ra: 267.5, dec: 57.5 },
  { id: 'ophiuchus-field', ra: 247.5, dec: -7.5 },
  { id: 'libra-field', ra: 212.5, dec: -2.5 },
  { id: 'hercules-field', ra: 252.5, dec: 12.5 },
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

/** Full-page sky map view: search tools, coverage canvas, legend, inspector. */
export default function SkyPage() {
  const router = useRouter();
  const grid = useMemo(() => {
    const g = buildGrid();
    return g;
  }, []);
  const [coverage, setCoverage] = useState(true);
  const [observer, setObserver] = useState(true);
  const [hover, setHover] = useState<SkyHover | null>(null);
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [field, setField] = useState<InspectorField | null>(null);
  const [focus, setFocus] = useState<StelFocus | null>(null);
  const [real, setReal] = useState<Map<string, RealCell> | null>(null);

  // cross-page jump target (from the command bar): focus + inspect on arrival
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sh-target');
      if (!raw) return;
      sessionStorage.removeItem('sh-target');
      const t = JSON.parse(raw) as { ra: number; dec: number };
      if (Number.isFinite(t.ra) && Number.isFinite(t.dec)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFocus({ ra: t.ra, dec: t.dec, key: Date.now() });
        inspect(t.ra, t.dec);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return () => { alive = false; };
  }, [grid]);

  const inspect = (ra: number, dec: number) => {
    setSel({ nx: ra / 360, ny: (90 - dec) / 180, ra, dec });
    setField(fieldFromRaDec(ra, dec, grid, real ?? undefined));
  };

  const pick = (t: SearchTarget) => {
    if (t.showcaseId) { router.push(blinkURL(t.showcaseId)); return; }
    if (observer) setFocus({ ra: t.ra, dec: t.dec, key: Date.now() });
    inspect(t.ra, t.dec);
  };

  return (
    <div id="view-sky">
      <h1 className="sr-only">Sky map</h1>
      {observer ? (
        <StellariumView
          focus={focus}
          onInspect={inspect}
          initial={{ ra: 83.8, dec: -5.4 }}
          liveStars={useLive}
        />
      ) : (
        <CoverageMap
          grid={grid} coverage={coverage} selected={sel}
          onHover={setHover}
          onInspect={inspect}
        />
      )}
      {!observer && (
        <>
          {/* compass + FOV indicator overlays */}
          <div aria-hidden="true" style={{ position: 'absolute', top: 'calc(var(--nav-total) + 170px)', right: 18, zIndex: 5, width: 56, height: 56, borderRadius: '50%', background: 'rgba(5,6,12,.78)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 12, color: '#eef0f8', fontFamily: 'monospace' }}>
            <span>N ↑<br />E ←</span>
          </div>
          <div className="glass mono" style={{ position: 'absolute', top: 'calc(var(--nav-total) + 236px)', right: 18, zIndex: 5, fontSize: 11, padding: '4px 10px', borderRadius: 999, color: '#aab0c8' }}>
            FOV 10′ · cell 5°×5°
          </div>
        </>
      )}

      <div className="map-tools glass">
        <p className="map-title">Find a field</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchBox id="ms" placeholder="Object or RA, Dec" compact onPick={pick} />
          </div>
          <SurpriseButton compact onPick={pick} className="lucky-icon-btn" />
        </div>
        <div className="tool-row">
          <div className="segment" role="group" aria-label="Sky view">
            <button type="button" aria-pressed={observer} onClick={() => setObserver(true)}>Observer</button>
            <button type="button" aria-pressed={!observer} onClick={() => setObserver(false)}>All-sky map</button>
          </div>
        </div>
        {!observer && (
          <div className="tool-row">
            <span id="covLabel">Coverage overlay</span>
            <button
              type="button" className="switch" role="switch" aria-checked={coverage}
              aria-labelledby="covLabel" onClick={() => setCoverage((c) => !c)}
            />
          </div>
        )}
        <p className="map-help">{observer
          ? 'Drag to look around, scroll to zoom. Click any point to inspect its SPHEREx visits.'
          : 'Click any field to see how many times SPHEREx has visited it and whether anything moved.'}</p>
      </div>

      {!observer && (
        <div className="map-bar glass">
          <div className="legend">
            <span>Epochs observed</span>
            <span className="strip" aria-hidden="true">
              {LEVEL_COLORS.slice(1).map((c) => (
                <i key={c as string} style={{ background: c as string }} />
              ))}
            </span>
            <span>1 to 5+</span>
          </div>
          <span className="sep" aria-hidden="true" />
          <span className="mono" id="skyReadout" aria-hidden="true">
            {hover ? `RA ${fmtRa(hover.ra)}  Dec ${fmtDec(hover.dec)}  ${hover.n} ${hover.n === 1 ? 'epoch' : 'epochs'}` : 'RA —, Dec —'}
          </span>
        </div>
      )}

      <Inspector
        field={field} blinkId={field ? (nearestShowcase(field.ra, field.dec) ?? (useLive && field.epochs >= 2 ? 'live' : null)) : null}
        onClose={() => { setField(null); setSel(null); }}
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
