'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LEVEL_COLORS } from '@/lib/sky';
import { buildGrid, GRID_H, GRID_W } from '@/lib/sky';
import { getCoverage, type RealCell } from '@/lib/showcases';
import CoverageMap, { type MapSelection } from '@/components/CoverageMap';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import Inspector, { type InspectorField } from '@/components/Inspector';
import type { SkyHover } from '@/components/HeroSky';
import { fmtDec, fmtRa } from '@/lib/sky';

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
  const { openShowcase } = useAppStore();
  const grid = useMemo(() => {
    const g = buildGrid();
    return g;
  }, []);
  const [coverage, setCoverage] = useState(true);
  const [hover, setHover] = useState<SkyHover | null>(null);
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [field, setField] = useState<InspectorField | null>(null);
  const [real, setReal] = useState<Map<string, RealCell> | null>(null);

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
    if (t.showcaseId) { openShowcase(t.showcaseId); return; }
    inspect(t.ra, t.dec);
  };

  return (
    <div id="view-sky">
      <h1 className="sr-only">Sky map</h1>
      <CoverageMap
        grid={grid} coverage={coverage} selected={sel}
        onHover={setHover}
        onInspect={inspect}
      />

      <div className="map-tools glass">
        <SearchBox id="ms" placeholder="Object or RA, Dec" compact onPick={pick} />
        <div className="tool-row">
          <span id="covLabel">Coverage overlay</span>
          <button
            type="button" className="switch" role="switch" aria-checked={coverage}
            aria-labelledby="covLabel" onClick={() => setCoverage((c) => !c)}
          />
        </div>
        <p className="map-help">Click any field to see how many times SPHEREx has visited it and whether anything moved.</p>
      </div>

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

      <Inspector
        field={field} blinkId={field ? nearestShowcase(field.ra, field.dec) : null}
        onClose={() => { setField(null); setSel(null); }}
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
