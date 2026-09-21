'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';import BlinkComparator from '@/components/BlinkComparator';
import Icon from '@/components/Icon';
import SpectrumPlot, { LightCurve } from '@/components/Plots';
import {
  fetchLiveShowcase, getShowcase, isLiveId, parseLiveId,
  skybotMatches, useLive, type Showcase,
} from '@/lib/showcases';
import { blinkURL, useAppStore } from '@/lib/store';
import { fmtDec, fmtRa } from '@/lib/sky';
import { BANDS } from '@/lib/sky';
import { arcsecPerDay, mjdToDate, toCSV } from '@/lib/astro';
import { horizonsURL, irsaViewerURL, mpcCheckerURL, simbadURL, skybotURL } from '@/lib/catalogs';

type RailTab = 'overview' | 'epochs' | 'catalogs' | 'share';

/** Blink workspace: fixed-viewport viewer + tabbed data rail. No page scroll on desktop. */
export default function BlinkPage({ id }: { id: string }) {
  const { compareMode, setCompareMode, epochIdx, setEpochIdx, band, setBand, showMarkers, setShowMarkers } = useAppStore();
  const [data, setData] = useState<Showcase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [skybot, setSkybot] = useState<Array<{ name: string }> | null>(null);
  const [sample, setSample] = useState<{ x: number; y: number; values: number[] } | null>(null);
  const [tab, setTab] = useState<RailTab>('overview');
  const [flag, setFlag] = useState('');
  const [flags, setFlags] = useState<Array<{ x: number; note: string }>>([]);
  const [liveSpec, setLiveSpec] = useState<Array<{ wavelength_um: number; flux: number }> | null>(null);
  const [liveLc, setLiveLc] = useState<Array<{ mjd?: number; flux: number }> | null>(null);
  const viewing = data && data.id === id ? data : null;

  // load showcase (static JSON or live IRSA frames)
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErr(null);
    setData(null);
    setSample(null);
    setLiveSpec(null);
    setLiveLc(null);
    const done = (d: Showcase) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
      setBand(d.epochs[0]?.band ?? 3);
      setEpochIdx(0);
      // shared-link state (?band=&epoch=&mode=) applies once on entry
      try {
        const q = new URLSearchParams(window.location.search);
        const qb = parseInt(q.get('band') ?? '', 10);
        if (qb >= 1 && qb <= 6) setBand(qb);
        const qe = parseInt(q.get('epoch') ?? '', 10);
        if (Number.isInteger(qe) && qe >= 0) setEpochIdx(qe);
        const qm = q.get('mode');
        if (qm === 'side' || qm === 'swipe' || qm === 'diff' || qm === 'blink') setCompareMode(qm);
      } catch { /* keep defaults */ }
      setSkybot(null);
      const mjd = d.epochs[0]?.mjd;
      if (mjd) void skybotMatches(d.ra, d.dec, mjd).then((m) => { if (alive) setSkybot(m); });
    };
    if (isLiveId(id)) {
      const p = parseLiveId(id);
      if (!p) { setErr('Bad live-field link.'); setLoading(false); return; }
      setBand(p.band);
      void fetchLiveShowcase(p.ra, p.dec, p.band)
        .then(done)
        .catch((e: unknown) => {
          if (!alive) return;
          setErr(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    } else {
      void getShowcase(id)
        .then(done)
        .catch((e: unknown) => {
          if (!alive) return;
          setErr(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // live spectrum + light curve (real pipeline numbers when API is live)
  useEffect(() => {
    if (!viewing || !useLive) return;
    let alive = true;
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    void fetch(`${base}/api/spectrum?ra=${viewing.ra}&dec=${viewing.dec}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && Array.isArray(j.points) && j.points.length) setLiveSpec(j.points); })
      .catch(() => undefined);
    void fetch(`${base}/api/lightcurve?ra=${viewing.ra}&dec=${viewing.dec}&band=${band}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && Array.isArray(j.points) && j.points.length) setLiveLc(j.points); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [viewing, band]);

  // permalink: reflect state in URL without navigation.
  // Live fields use the canonical /blink/live page (static-safe); showcases use /blink/<id>.
  useEffect(() => {
    if (isLiveId(id)) {
      const p = parseLiveId(id);
      if (!p) return;
      const q = new URLSearchParams({
        ra: String(p.ra), dec: String(p.dec), band: String(band),
        epoch: String(epochIdx), mode: compareMode,
      });
      window.history.replaceState(null, '', `/blink/live?${q.toString()}`);
      return;
    }
    window.history.replaceState(null, '', blinkURL(id, { band, epoch: epochIdx, mode: compareMode }));
  }, [id, band, epochIdx, compareMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`sh-flags-${id}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFlags(JSON.parse(raw));
    } catch { /* noop */ }
  }, [id]);

  const epochs = useMemo(() => viewing?.epochs ?? [], [viewing]);
  const m0 = epochs[0]?.mjd;
  const m1 = epochs[1]?.mjd;
  const motion = useMemo(() => {
    if (!viewing || m0 === undefined || m1 === undefined) return null;
    const a = epochs[0];
    const b = epochs[1];
    return arcsecPerDay(a.ra ?? viewing.ra, a.dec ?? viewing.dec, b.ra ?? viewing.ra, b.dec ?? viewing.dec, m1 - m0);
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
    a.download = `${viewing.id.replace(/[^a-z0-9]+/gi, '-')}-candidates.json`;
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
    a.download = `${viewing.id.replace(/[^a-z0-9]+/gi, '-')}-candidates.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const saveFlag = () => {
    if (!sample) return;
    const next = [...flags, { x: Math.round(sample.x * 1000) / 1000, note: flag || 'something moving here' }];
    setFlags(next);
    setFlag('');
    try { localStorage.setItem(`sh-flags-${id}`, JSON.stringify(next)); } catch { /* noop */ }
  };

  const cur = epochs[Math.min(epochIdx, Math.max(0, epochs.length - 1))];

  return (
    <div className="blink-workspace">
      <div className="bw-bar">
        <Link href="/sky" className="back"><Icon name="back" /><span>Sky</span></Link>
        <div className="bw-toggles">
          <span id="markLabel">Movers</span>
          <button type="button" className="switch" role="switch" aria-checked={showMarkers} aria-labelledby="markLabel" onClick={() => setShowMarkers(!showMarkers)} />
        </div>
      </div>

      {loading && <div className="bw-status">Loading {isLiveId(id) ? 'live IRSA frames (discovery + renders, ~1 min first time)' : id}…</div>}
      {err && !loading && (
        <div className="bw-status error">
          Couldn’t load this field: {err} — try a <Link href="/blink/3i-atlas">curated blink</Link> or pick another map point.
        </div>
      )}

      {viewing && (
        <div className="bw-grid">
          <section className="bw-viewer" aria-label="Epoch comparator">
            <div className="bw-title">
              <h1>{viewing.title}</h1>
              <p className="mono">{BANDS[band - 1]?.range ?? ''} · {epochs.length} epoch{epochs.length === 1 ? '' : 's'}</p>
            </div>
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
              onToggleMarkers={() => setShowMarkers(!showMarkers)}
              onSample={setSample}
              center={{ ra: viewing.ra, dec: viewing.dec }}
            />
          </section>

          <aside className="bw-rail" aria-label="Field data">
            <div className="rtabs" role="tablist" aria-label="Field data">
              {(['overview', 'epochs', 'catalogs', 'share'] as RailTab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={`rtab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                  {t === 'overview' ? 'Overview' : t === 'epochs' ? `Epochs (${epochs.length})` : t === 'catalogs' ? 'Catalogs' : 'Share'}
                </button>
              ))}
            </div>
            <div className="rail-body">
              {tab === 'overview' && (
                <>
                  <div className="verdict-row">
                    <span className="badge unknown"><span className="dot" /> Unidentified, needs review</span>
                  </div>
                  <p className="story">{viewing.story}</p>
                  <dl className="meta-grid">
                    <dt>RA / Dec</dt><dd className="mono">{fmtRa(viewing.ra)} / {fmtDec(viewing.dec)}</dd>
                    <dt>Epochs</dt><dd className="mono">{epochs.length}</dd>
                    <dt>Band</dt><dd className="mono">D{band}</dd>
                    <dt>Obs ID</dt><dd className="mono">{cur?.obs_id ?? '—'}</dd>
                    <dt>Date</dt><dd className="mono">{cur?.mjd ? `${mjdToDate(cur.mjd)} (MJD ${cur.mjd.toFixed(2)})` : '—'}</dd>
                    <dt>Scale</dt><dd className="mono">6.2″/px</dd>
                    <dt>Motion</dt><dd className="mono">{motion === null ? 'needs 2 dated epochs' : `${motion.toFixed(1)} ″/day`}</dd>
                  </dl>
                  <h3>Brightness vs time</h3>
                  {liveLc?.length || sample?.values.length ? (
                    <>
                      <LightCurve
                        mjds={liveLc ? liveLc.map((p) => p.mjd) : epochs.map((e) => e.mjd)}
                        values={liveLc ? liveLc.map((p) => p.flux) : (sample?.values ?? [])}
                        real={!!liveLc}
                      />
                      {liveLc && <p className="fine">Real pipeline aperture photometry.</p>}
                    </>
                  ) : (
                    <p className="fine">No brightness samples yet — arm Measure on the image and click a spot, or wait for live pipeline photometry.</p>
                  )}
                </>
              )}
              {tab === 'epochs' && (
                <>
                  <div className="epoch-list">
                    {epochs.map((e, i) => (
                      <button key={e.label} type="button" onClick={() => setEpochIdx(i)}
                        className={`epoch-item${i === epochIdx ? ' active' : ''}`} aria-pressed={i === epochIdx}>
                        <span>{e.label}</span>
                        <span className="mono">{e.mjd ? mjdToDate(e.mjd) : ''}</span>
                      </button>
                    ))}
                  </div>
                  <h3>Spectrum at click</h3>
                  {sample ? (
                    <SpectrumPlot values={liveSpec ? liveSpec.map((p) => p.flux) : sample.values} band={band} />
                  ) : (
                    <p className="fine">Click the image to sample this spot{liveSpec ? '' : ' (proxy until live spectra load)'}. {liveSpec ? 'Real 6-band pipeline fluxes below.' : ''}</p>
                  )}
                  {liveSpec && !sample && (
                    <SpectrumPlot values={liveSpec.map((p) => p.flux)} band={band} />
                  )}
                </>
              )}
              {tab === 'catalogs' && (
                <>
                  <h3>Solar-system cross-match</h3>
                  <p>
                    {skybot === null
                      ? 'Checking SkyBoT…'
                      : skybot.length
                        ? `SkyBoT match: ${skybot[0].name}.`
                        : 'No SkyBoT match — service unreachable or field empty; verify with the links below.'}
                  </p>
                  {viewing.epochs[0]?.note && <p>{viewing.epochs[0].note}</p>}
                  <div className="ext-links">
                    <a href={skybotURL(viewing.ra, viewing.dec, epochs[0]?.mjd ?? 60888)} target="_blank" rel="noreferrer">SkyBoT cone <Icon name="ext" /></a>
                    <a href={mpcCheckerURL(viewing.ra, viewing.dec, epochs[0]?.mjd ?? 60888)} target="_blank" rel="noreferrer">Minor Planet Center <Icon name="ext" /></a>
                    <a href={horizonsURL(viewing.title.split('—')[0].trim())} target="_blank" rel="noreferrer">JPL Horizons <Icon name="ext" /></a>
                    <a href={simbadURL(viewing.ra, viewing.dec)} target="_blank" rel="noreferrer">SIMBAD <Icon name="ext" /></a>
                    {cur?.cutout_url && <a href={cur.cutout_url} target="_blank" rel="noreferrer">Original FITS at IRSA <Icon name="ext" /></a>}
                    <a href={irsaViewerURL(viewing.ra, viewing.dec)} target="_blank" rel="noreferrer">IRSA Viewer <Icon name="ext" /></a>
                  </div>
                  <h3>Provenance</h3>
                  <p>Level-2 spectral image MEF, QR2 pipeline, IRSA/IPAC.</p>
                  <p className="cite-box">Data: NASA/JPL–Caltech SPHEREx, processed by IRSA (IPAC). DOI 10.26131/IRSA652.</p>
                </>
              )}
              {tab === 'share' && (
                <>
                  <h3>Share & export</h3>
                  <div className="btn-row">
                    <button type="button" className="epoch-chip" onClick={copyLink}>Copy link</button>
                    <button type="button" className="epoch-chip" onClick={exportCSV}>CSV</button>
                    <button type="button" className="epoch-chip" onClick={exportJSON}>JSON</button>
                  </div>
                  <div className="btn-row">
                    <button type="button" className="epoch-chip"
                      onClick={() => window.dispatchEvent(new CustomEvent('spectrahunt:export', { detail: { kind: 'figure' } }))}>
                      Figure PNG
                    </button>
                    <button type="button" className="epoch-chip"
                      onClick={() => window.dispatchEvent(new CustomEvent('spectrahunt:export', { detail: { kind: 'webm' } }))}>
                      Animation
                    </button>
                    <button type="button" className="epoch-chip"
                      onClick={() => window.dispatchEvent(new Event('spectrahunt:palette'))}>
                      Commands ⌘K
                    </button>
                  </div>
                  <h3>Community flags ({flags.length})</h3>
                  <p className="fine">Stored in this browser only. Click the image, then flag the spot.</p>
                  <div className="btn-row">
                    <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="Note"
                      aria-label="Flag note" className="flag-input" />
                    <button type="button" className="epoch-chip" onClick={saveFlag} disabled={!sample}>Flag</button>
                  </div>
                  {!!flags.length && (
                    <ul className="flag-list">
                      {flags.map((f, i) => <li key={i}>#{i + 1} x={f.x} — {f.note}</li>)}
                    </ul>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
