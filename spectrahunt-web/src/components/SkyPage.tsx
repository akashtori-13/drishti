'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { LEVEL_COLORS } from '@/lib/sky';
import { buildGrid, GRID_H, GRID_W } from '@/lib/sky';
import { getCoverage, type RealCell } from '@/lib/showcases';
import CoverageMap, { type MapSelection } from '@/components/CoverageMap';
import StellariumView, { type StelFocus } from '@/components/StellariumView';
import SearchBox, { type SearchTarget } from '@/components/SearchBox';
import SurpriseButton from '@/components/SurpriseButton';
import Inspector, { type InspectorField } from '@/components/Inspector';
import type { SkyHover } from '@/components/HeroSky';
import { fmtDec, fmtRa, nearestShowcase } from '@/lib/sky';
import { useLive } from '@/lib/showcases';

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
  const openPreview = useAppStore((s) => s.openPreview);
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
  // Observer<->All-sky crossfade: `shown` (rendered view) lags `observer`
  // (target) through a fade-out / swap / fade-in. Consumes the motion tokens
  // with local fallbacks until the shared .xfade class lands in globals.css.
  const [shown, setShown] = useState(true);
  const [fading, setFading] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantFocus = useRef(false);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  useEffect(() => () => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
  }, []);
  // focus continuity: if focus was inside the sky stage at swap time, carry it
  // to the incoming canvas once mounted.
  useEffect(() => {
    if (wantFocus.current) {
      wantFocus.current = false;
      stageRef.current?.querySelector('canvas')?.focus();
    }
  }, [shown]);
  const setView = (next: boolean) => {
    if (next === observer) return;
    if (swapTimer.current) clearTimeout(swapTimer.current);
    // sel continuity: arriving in Observer centers it on the map selection
    if (next && sel) setFocus({ ra: sel.ra, dec: sel.dec, key: Date.now() });
    wantFocus.current = !!stageRef.current?.contains(document.activeElement);
    setObserver(next);
    if (reduced) {
      setShown(next); // instant cut under reduced motion
      return;
    }
    setFading(true);
    swapTimer.current = setTimeout(() => {
      setShown(next);
      requestAnimationFrame(() => requestAnimationFrame(() => setFading(false)));
    }, 220);
  };

  // inspector selection (declared before effects: the arrival-target effect calls it)
  const inspect = (ra: number, dec: number) => {
    setSel({ nx: ra / 360, ny: (90 - dec) / 180, ra, dec });
    setField(fieldFromRaDec(ra, dec, grid, real ?? undefined));
  };

  // cross-page jump target (from the command bar): focus marker on arrival.
  // The inspector panel opens only on map taps, never on arrival.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sh-target');
      if (!raw) return;
      sessionStorage.removeItem('sh-target');
      const t = JSON.parse(raw) as { ra: number; dec: number };
      if (Number.isFinite(t.ra) && Number.isFinite(t.dec)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFocus({ ra: t.ra, dec: t.dec, key: Date.now() });
        setSel({ nx: t.ra / 360, ny: (90 - t.dec) / 180, ra: t.ra, dec: t.dec });
      }
    } catch { /* noop */ }
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

  const pick = (t: SearchTarget) => {
    if (t.showcaseId) { openPreview(t.showcaseId); return; }
    const near = nearestShowcase(t.ra, t.dec);
    if (near) { openPreview(near); return; }
    // search arrivals focus the map only — the inspector panel belongs to
    // map clicks, so it stays closed until the user taps the sky itself
    if (observer) setFocus({ ra: t.ra, dec: t.dec, key: Date.now() });
    setSel({ nx: t.ra / 360, ny: (90 - t.dec) / 180, ra: t.ra, dec: t.dec });
  };

  return (
    <div id="view-sky">
      <h1 className="sr-only">SkyMap</h1>
      <div
        ref={stageRef}
        className="xfade"
        style={{
          position: 'absolute', inset: 0,
          opacity: fading ? 0 : 1,
          transition: reduced ? 'none' : 'opacity var(--dur-ui, 220ms) var(--ease-out, cubic-bezier(.23,1,.32,1))',
        }}
      >
        {shown ? (
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
      </div>
      {!shown && (
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
            <SearchBox id="ms" placeholder="Object or RA, Dec" compact onPick={pick} handoff />
          </div>
          <SurpriseButton compact onPick={pick} className="lucky-icon-btn" />
        </div>
        <div className="tool-row">
          <div className="segment" role="group" aria-label="Sky view">
            <button type="button" className={observer ? 'active' : ''} aria-pressed={observer} onClick={() => setView(true)}>Observer</button>
            <button type="button" className={!observer ? 'active' : ''} aria-pressed={!observer} onClick={() => setView(false)}>All-sky map</button>
          </div>
        </div>
        {!shown && (
          <div className="tool-row">
            <span id="covLabel">Coverage overlay</span>
            <button
              type="button" className="switch" role="switch" aria-checked={coverage}
              aria-labelledby="covLabel" onClick={() => setCoverage((c) => !c)}
            />
          </div>
        )}
        <p className="map-help">{shown
          ? 'Drag to look around, scroll to zoom. Click any point to inspect its SPHEREx visits.'
          : 'Click any field to see how many times SPHEREx has visited it and whether anything moved.'}</p>
      </div>

      {!shown && (
        <div className="map-bar glass">
          <div className="legend">
            <span>Epochs observed</span>
            <span className="strip" aria-hidden="true">
              {LEVEL_COLORS.slice(1).map((c) => (
                <i key={c as string} style={{ background: c as string }} />
              ))}
            </span>
            <span>1 to 5+</span>
            <span className="sep" aria-hidden="true" />
            <span title="Approximate ecliptic search zone — the dashed gold curve on the map is the true plane" style={{ color: '#e8c34a' }}>◆ ecliptic</span>
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
            if (id) openPreview(id);
            else if (useLive && field.epochs >= 2) router.push(`/blink/live?ra=${field.ra.toFixed(3)}&dec=${field.dec.toFixed(3)}&band=3`);
          }
          setField(null);
        }}
      />
    </div>
  );
}
