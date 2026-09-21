'use client';

import { useEffect, useMemo, useState } from 'react';
import BlinkComparator from '@/components/BlinkComparator';
import Icon from '@/components/Icon';
import SpectrumPlot, { LightCurve } from '@/components/Plots';
import { SHOWCASE_IDS, getShowcase, skybotMatches, type Showcase } from '@/lib/showcases';
import { useAppStore } from '@/lib/store';
import { fmtDec, fmtRa } from '@/lib/sky';
import { arcsecPerDay, decodeView, encodeView, toCSV } from '@/lib/astro';
import { GLOSSARY, TOURS, horizonsURL, irsaViewerURL, mpcCheckerURL, simbadURL, skybotURL } from '@/lib/catalogs';

/** Blink view: player + aside (metadata, epochs, cross-match, provenance, export). */
export default function BlinkPage() {
  const { showcaseId, openShowcase, setCurrentView, compareMode, setCompareMode, epochIdx, setEpochIdx, band, setBand, showMarkers, setShowMarkers } = useAppStore();
  const [data, setData] = useState<Showcase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skybot, setSkybot] = useState<Array<{ name: string }> | null>(null);
  const [sample, setSample] = useState<{ x: number; y: number; values: number[] } | null>(null);
  const [tour, setTour] = useState(0);
  const [flag, setFlag] = useState('');
  const [flags, setFlags] = useState<Array<{ x: number; note: string }>>([]);
  const viewing = data && data.id === showcaseId ? data : null;

  useEffect(() => {
    let alive = true;
    getShowcase(showcaseId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setErr(null);
        setBand(d.epochs[0]?.band ?? 3);
        setEpochIdx(0);
        setSample(null);
        setSkybot(null);
        const mjd = d.epochs[0]?.mjd;
        if (mjd) void skybotMatches(d.ra, d.dec, mjd).then((m) => { if (alive) setSkybot(m); });
      })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showcaseId]);

  // permalink: read once, write on change
  useEffect(() => {
    const v = decodeView(window.location.hash);
    if (v.band && v.band >= 1 && v.band <= 6) setBand(v.band);
    if (v.epoch !== undefined && v.epoch >= 0) setEpochIdx(v.epoch);
    if (v.mode === 'side' || v.mode === 'swipe' || v.mode === 'diff' || v.mode === 'blink') setCompareMode(v.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showcaseId]);
  useEffect(() => {
    const target = encodeView({ showcase: showcaseId, ra: data?.ra, dec: data?.dec, band, epoch: epochIdx, mode: compareMode });
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [showcaseId, data, band, epochIdx, compareMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`sh-flags-${showcaseId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFlags(JSON.parse(raw));
    } catch { /* noop */ }
  }, [showcaseId]);

  const epochs = useMemo(() => viewing?.epochs ?? [], [viewing]);
  const m0 = epochs[0]?.mjd;
  const m1 = epochs[1]?.mjd;
  const motion = useMemo(() => {
    if (!viewing || m0 === undefined || m1 === undefined) return null;
    const dt = m1 - m0;
    const a = epochs[0];
    const b = epochs[1];
    return arcsecPerDay(a.ra ?? viewing.ra, a.dec ?? viewing.dec, b.ra ?? viewing.ra, b.dec ?? viewing.dec, dt);
  }, [viewing, m0, m1, epochs]);

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  };

  const exportJSON = () => {
    if (!viewing) return;
    const blob = new Blob([JSON.stringify(viewing, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${viewing.id}-candidates.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const exportCSV = () => {
    if (!viewing) return;
    const rows = epochs.map((e, i) => ({
      showcase: viewing.id, epoch: i, label: e.label, ra: e.ra ?? viewing.ra, dec: e.dec ?? viewing.dec,
      mjd: e.mjd ?? '', band: e.band ?? band, wavelength_um: e.wavelength_um ?? '',
      obs_id: e.obs_id ?? '', png: e.png ?? '', cutout_url: e.cutout_url ?? '',
    }));
    const blob = new Blob([toCSV(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${viewing.id}-candidates.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const saveFlag = () => {
    if (!sample) return;
    const next = [...flags, { x: Math.round(sample.x * 1000) / 1000, note: flag || 'something moving here' }];
    setFlags(next);
    setFlag('');
    try { localStorage.setItem(`sh-flags-${showcaseId}`, JSON.stringify(next)); } catch { /* noop */ }
  };

  return (
    <div className="blink-layout">
      <button type="button" className="back" onClick={() => setCurrentView('sky')}>
        <Icon name="back" /><span>Back to sky map</span>
      </button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <div className="flex flex-wrap gap-2">
          {SHOWCASE_IDS.map((s) => (
            <button
              key={s} type="button" onClick={() => openShowcase(s)}
              className={`px-3 py-1.5 rounded-full text-sm border ${showcaseId === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-700 text-slate-300'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#aab0c8' }}>
          <span id="markLabel">Movers</span>
          <button type="button" className="switch" role="switch" aria-checked={showMarkers} aria-labelledby="markLabel" onClick={() => setShowMarkers(!showMarkers)} />
        </div>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500 text-red-300 px-4 py-3 rounded-lg">Failed to load {showcaseId}: {err}</div>}
      {!viewing && !err && <div className="text-slate-400">Loading {showcaseId}…</div>}

      {viewing && (
        <>
          <div className="field-head">
            <div>
              <h1 className="field-title">{viewing.title}</h1>
              <p className="field-sub">RA {fmtRa(viewing.ra)} · Dec {fmtDec(viewing.dec)}</p>
            </div>
            <span className="badge unknown"><span className="dot" /> Unidentified, needs review</span>
          </div>

          <div className="field-grid">
            <div>
              <BlinkComparator
                key={viewing.id}
                title={viewing.title}
                frames={viewing.epochs.map((e) => ({
                  label: e.label, png: e.png, note: e.note, obs_id: e.obs_id, mjd: e.mjd,
                }))}
                band={band}
                onBandChange={setBand}
                mode={compareMode}
                onModeChange={setCompareMode}
                epochIdx={epochIdx}
                onEpochChange={setEpochIdx}
                showMarkers={showMarkers}
                onSample={setSample}
              />
              {sample && (
                <div className="aside" style={{ marginTop: 16 }}>
                  <section>
                    <h2>Spectrum at click ({(sample.x * 100).toFixed(0)}%, {(sample.y * 100).toFixed(0)}%)</h2>
                    <SpectrumPlot values={sample.values.length ? sample.values : epochs.map(() => 0)} band={band} />
                  </section>
                </div>
              )}
            </div>

            <aside className="aside" aria-label="Field details">
              <section>
                <h2>Story</h2>
                <p>{viewing.story}</p>
              </section>
              <section>
                <h2>Field metadata</h2>
                <dl className="kv mono">
                  <dt>RA / Dec</dt><dd>{fmtRa(viewing.ra)} / {fmtDec(viewing.dec)}</dd>
                  <dt>Epochs</dt><dd>{viewing.epochs.length}</dd>
                  <dt>Band</dt><dd>D{band}</dd>
                  <dt>Epoch</dt><dd>{epochs[epochIdx]?.label ?? '—'}</dd>
                  <dt>Obs ID</dt><dd>{epochs[epochIdx]?.obs_id ?? '—'}</dd>
                  <dt>MJD / UTC</dt><dd>{epochs[epochIdx]?.mjd ? `${epochs[epochIdx]?.mjd} / ${new Date((epochs[epochIdx]?.mjd ?? 0 - 40587) * 86400000 + Date.UTC(1858, 10, 17)).toISOString().slice(0, 10)}` : '—'}</dd>
                  <dt>Pixel scale</dt><dd>6.2″/px</dd>
                  <dt>Motion</dt><dd>{motion === null ? '— (needs 2 dated epochs)' : `${motion.toFixed(1)} ″/day`}</dd>
                </dl>
                {(
                  <div className="ext-links">
                    {epochs[epochIdx]?.cutout_url && <a href={epochs[epochIdx]?.cutout_url} target="_blank" rel="noreferrer">Original FITS at IRSA <Icon name="ext" /></a>}
                    <a href={irsaViewerURL(viewing.ra, viewing.dec)} target="_blank" rel="noreferrer">Open in IRSA Viewer <Icon name="ext" /></a>
                  </div>
                )}
              </section>
              {(
                <section>
                  <h2>Candidate light curve</h2>
                  <LightCurve mjds={epochs.map((e) => e.mjd)} values={sample?.values.length ? sample.values : epochs.map((_, i) => (i === epochIdx ? 90 : 60))} />
                  {motion !== null && motion > 1 && <p style={{ marginTop: 8 }}>Fast mover: {motion.toFixed(1)} ″/day suggests a solar-system object.</p>}
                </section>
              )}
              <section>
                <h2>Solar-system cross-match</h2>
                <p>
                  {skybot === null
                    ? 'Checked against SkyBoT when the dev API is live; static mode shows showcase notes.'
                    : skybot.length
                      ? `SkyBoT match: ${skybot[0].name}.`
                      : 'No cataloged object within the search radius — possibly an artifact or uncatalogued.'}
                </p>
                {viewing.epochs[0]?.note && <p style={{ marginTop: 8 }}>{viewing.epochs[0]?.note}</p>}
                {(
                  <div className="ext-links">
                    <a href={skybotURL(viewing.ra, viewing.dec, epochs[0]?.mjd ?? 60888)} target="_blank" rel="noreferrer">SkyBoT cone search <Icon name="ext" /></a>
                    <a href={mpcCheckerURL(viewing.ra, viewing.dec, epochs[0]?.mjd ?? 60888)} target="_blank" rel="noreferrer">Minor Planet Center checker <Icon name="ext" /></a>
                    <a href={horizonsURL(viewing.title.split('—')[0].trim())} target="_blank" rel="noreferrer">JPL Horizons <Icon name="ext" /></a>
                    <a href={simbadURL(viewing.ra, viewing.dec)} target="_blank" rel="noreferrer">SIMBAD near this position <Icon name="ext" /></a>
                  </div>
                )}
              </section>
              <section>
                <h2>Share & export</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="epoch-chip" onClick={copyLink}>Copy share link</button>
                  <button type="button" className="epoch-chip" onClick={exportCSV}>Candidates CSV</button>
                  <button type="button" className="epoch-chip" onClick={exportJSON}>Candidates JSON</button>
                </div>
              </section>
              {(
                <section>
                  <h2>Community flags ({flags.length})</h2>
                  <p>Mark “something’s moving here”. Stored in this browser only.</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="Note (click image first)"
                      aria-label="Flag note" style={{ flex: 1, background: '#0a0c16', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px' }}
                    />
                    <button type="button" className="epoch-chip" onClick={saveFlag} disabled={!sample}>Flag</button>
                  </div>
                  {!!flags.length && (
                    <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {flags.map((f, i) => <li key={i} style={{ fontSize: 12, color: '#aab0c8' }}>#{i + 1} x={f.x} — {f.note}</li>)}
                    </ul>
                  )}
                </section>
              )}
              <section>
                <h2>Data provenance</h2>
                <p>Level-2 spectral image MEF, QR2 pipeline, IRSA/IPAC.</p>
                <div className="ext-links">
                  {viewing.links && Object.entries(viewing.links).map(([k, v]) => (
                    <a key={k} href={v} target="_blank" rel="noreferrer">
                      {k} <Icon name="ext" />
                    </a>
                  ))}
                  <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">
                    SPHEREx archive at IRSA <Icon name="ext" />
                  </a>
                </div>
                <p className="cite-box">
                  Data: NASA/JPL–Caltech SPHEREx, processed by IRSA (IPAC). DOI 10.26131/IRSA652.
                </p>
              </section>
            </aside>
          </div>

          {/* guided tours + glossary */}
          <div style={{ display: 'grid', gap: 16, marginTop: 24, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
            <div className="aside">
              <section>
                <h2>Guided tour: {TOURS[tour].title}</h2>
                <p>{TOURS[tour].blurb}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {TOURS.map((t, i) => (
                    <button key={t.id} type="button" className="epoch-chip" aria-pressed={i === tour} onClick={() => setTour(i)}>{t.title}</button>
                  ))}
                </div>
                <ol style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {TOURS[tour].stops.map((s) => (
                    <li key={s.id} style={{ fontSize: 13, color: '#aab0c8' }}>
                      <strong style={{ color: '#fff' }}>{s.title}</strong> — {s.caption}{' '}
                      {s.showcaseId && <button type="button" className="epoch-chip" onClick={() => openShowcase(s.showcaseId!)}>Open</button>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className="aside">
              <section>
                <h2>Glossary</h2>
                <dl style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {GLOSSARY.map((g) => (
                    <div key={g.term} style={{ fontSize: 13 }}>
                      <dt style={{ color: '#fff', fontWeight: 600 }}>{g.term}</dt>
                      <dd style={{ color: '#aab0c8' }}>{g.plain}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
