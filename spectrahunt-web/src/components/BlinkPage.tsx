'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';import BlinkComparator from '@/components/BlinkComparator';
import Icon from '@/components/Icon';
import WaitGame from '@/components/WaitGame';
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

/** Live frame histogram for the Overview tab: reads the displayed canvas. */
function RailHistogram({ watch }: { watch: unknown }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const hc = ref.current;
    if (!hc) return;
    const draw = () => {
      const src = document.getElementById('blinkCanvas') as HTMLCanvasElement | null;
      const hctx = hc.getContext('2d');
      if (!src || !hctx || !src.width) return;
      hc.width = 260;
      hc.height = 52;
      let data: Uint8ClampedArray;
      try {
        data = hctx && src.getContext('2d', { willReadFrequently: true })?.getImageData(
          0, 0, src.width, src.height)?.data as Uint8ClampedArray;
      } catch { return; }
      if (!data) return;
      const bins = new Array<number>(48).fill(0);
      for (let i = 0; i < data.length; i += 32) {
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        bins[Math.min(47, Math.floor(lum * 48))]++;
      }
      hctx.clearRect(0, 0, hc.width, hc.height);
      const mx = Math.max(1, ...bins);
      hctx.fillStyle = '#7c83fd';
      bins.forEach((v, bi) => {
        const bh = Math.max(1, (v / mx) * (hc.height - 4));
        hctx.fillRect((bi / bins.length) * hc.width, hc.height - bh, hc.width / bins.length - 0.5, bh);
      });
    };
    const t = requestAnimationFrame(() => setTimeout(draw, 60));
    return () => cancelAnimationFrame(t);
  }, [watch]);
  return <canvas ref={ref} className="hist" style={{ width: '100%' }} aria-label="Live frame brightness histogram" />;
}

/** DSS2 + 2MASS context cutouts (land async via fetch_compare.py). */
function OtherEyes({ id }: { id: string }) {
  const [ok, setOk] = useState<Record<string, boolean>>({ dss: true, '2mass': true });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
      {([
        ['dss', 'DSS2 color', `/compare/${id}_dss.jpg`],
        ['2mass', '2MASS IR', `/compare/${id}_2mass.jpg`],
      ] as const).map(([k, label, src]) => (
        <figure key={k} style={{ margin: 0 }}>
          {ok[k] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`${label} view`} loading="lazy" draggable={false}
              style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 10, display: 'block', background: '#04050a' }}
              onError={() => setOk((o) => ({ ...o, [k]: false }))} />
          ) : (
            <span style={{ display: 'grid', placeItems: 'center', width: '100%', aspectRatio: '1/1', borderRadius: 10, background: '#04050a', color: '#8a90ab', fontSize: 11 }}>
              indexing…
            </span>
          )}
          <figcaption className="mono" style={{ fontSize: 11, color: '#8a90ab', marginTop: 4 }}>{label} · 0.5°</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Real mini-spectrum: center brightness of each detector-band cutout. */
function BandSpectrum({ viewing, sample, liveSpec, band }: {
  viewing: Showcase;
  sample: { x: number; y: number; values: number[] } | null;
  liveSpec: Array<{ wavelength_um: number; flux: number }> | null;
  band: number;
}) {
  const [pts, setPts] = useState<{ wave: number; flux: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    const entries = Object.entries(viewing.bands ?? {})
      .filter(([, b]) => b.png)
      .map(([, b]) => ({ png: b.png as string, wave: b.wavelength_um ?? 0 }));
    if (!entries.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPts(null); return;
    }
    void Promise.all(entries.map(({ png, wave }) => new Promise<{ wave: number; flux: number } | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 24; c.height = 24;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, 24, 24);
          const d = ctx.getImageData(10, 10, 4, 4).data;
          let s = 0;
          for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          resolve({ wave, flux: Math.round((s / 16) * 10) / 10 });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = png;
    }))).then((arr) => {
      if (!alive) return;
      const good = arr.filter((p): p is { wave: number; flux: number } => p !== null)
        .sort((a, b) => a.wave - b.wave);
      setPts(good.length >= 2 ? good : null);
    });
    return () => { alive = false; };
  }, [viewing]);
  if (liveSpec?.length) {
    return <SpectrumPlot values={liveSpec.map((p) => p.flux)} band={band} waves={liveSpec.map((p) => p.wavelength_um)} />;
  }
  if (pts) {
    return <SpectrumPlot values={pts.map((p) => p.flux)} band={band} waves={pts.map((p) => p.wave)} />;
  }
  if (sample) {
    return <SpectrumPlot values={sample.values} band={band} />;
  }
  return <p className="fine">Band images still indexing — click the image for an epoch proxy, or wait for live pipeline spectra.</p>;
}

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
  const [report, setReport] = useState<{
    movers: number; variables: number; top_sigma: number; span_days: number | null;
    variable_flag: boolean; known: { name: string; kind: string } | null; detail: string;
  } | null>(null);
  const [detStats, setDetStats] = useState<{ movers: number; variables: number; ready: boolean } | null>(null);
  // live blink: the game stays until a full pair decodes (one frame is a
  // still, not a blink). Latched during render — detStats flips back to null
  // whenever the viewer steps onto a pending frame, but the game must not
  // reappear mid-browse.
  const [pairSeen, setPairSeen] = useState(false);
  if (detStats?.ready && !pairSeen) {
    setPairSeen(true);
  }
  const viewing = data && data.id === id ? data : null;

  // load showcase (static JSON or live IRSA frames)
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErr(null);
    setData(null);
    setPairSeen(false);
    setSample(null);
    setLiveSpec(null);
    setLiveLc(null);
    setReport(null);
    void fetch(`/reports/${id}.json`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && j.detail === 'ok') setReport(j); })
      .catch(() => undefined);
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
        // clamp both ends: negative or past-the-last shared links land on an edge
        if (Number.isInteger(qe)) setEpochIdx(Math.min(Math.max(0, qe), Math.max(0, d.epochs.length - 1)));
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

  // Background revalidation: getShowcase() serves the device copy instantly and
  // refreshes behind. When fresh JSON arrives (e.g. newly indexed PNGs), swap
  // it in without a manual reload — preserving the viewer's band/epoch choice.
  useEffect(() => {
    if (isLiveId(id)) return;
    const onRevalidate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string; data?: Showcase } | undefined;
      if (detail?.key !== `sh-showcase:${id}` || !detail?.data) return;
      const fresh = detail.data;
      if (fresh.id !== id) return;
      setData((prev) => {
        if (!prev || prev.id !== id) return prev;
        try {
          if (JSON.stringify(prev) === JSON.stringify(fresh)) return prev;
        } catch { /* fall through and swap */ }
        return fresh;
      });
    };
    window.addEventListener('sh-revalidate', onRevalidate);
    return () => window.removeEventListener('sh-revalidate', onRevalidate);
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

  // Share links are built on demand from live state. The address bar is never
  // rewritten while browsing — stepping frames must not touch the URL.
  const shareURL = () => {
    const base = window.location.origin + window.location.pathname;
    if (isLiveId(id)) {
      const p = parseLiveId(id);
      if (!p) return window.location.href;
      const q = new URLSearchParams({
        ra: String(p.ra), dec: String(p.dec), band: String(band),
        epoch: String(epochIdx), mode: compareMode,
      });
      return `${base}?${q.toString()}`;
    }
    return window.location.origin + blinkURL(id, { band, epoch: epochIdx, mode: compareMode });
  };

  // Space/WaitGame double-handling guard (capture phase, runs before the
  // game and viewer handlers): editable targets keep their keys — neither the
  // invaders game nor blink transport may steal Space/arrows from a field.
  useEffect(() => {
    const guard = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.tagName !== 'string') return;
      const tag = t.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)
        || t.getAttribute?.('role') === 'combobox' || t.isContentEditable) {
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', guard, { capture: true });
    return () => document.removeEventListener('keydown', guard, { capture: true });
  }, []);

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
    const url = shareURL();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }
    } catch { /* fall through to the legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch { /* clipboard unavailable — link stays in the address bar */ }
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

      {loading && (isLiveId(id)
        ? <WaitGame status="Fetching live IRSA frames — discovery, renders, cross-match…" />
        : <div className="bw-status">Loading {id}…</div>
      )}
      {!loading && isLiveId(id) && viewing && !pairSeen && (
        <WaitGame status="First frames decoding — almost there…" />
      )}
      {err && !loading && (
        <div className="bw-status error">
          Couldn’t load this field: {err} — try a <Link href="/blink/3i-atlas">curated blink</Link> or pick another map point.
        </div>
      )}

      {viewing && (
        <div className="bw-grid" style={isLiveId(id) && !pairSeen ? { display: 'none' } : undefined}>
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
              onStats={setDetStats}
              bandPngs={Object.fromEntries(
                Object.entries(viewing.bands ?? {}).map(([k, b]) => [Number(k), b.png ?? null]),
              )}
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
                    {report?.known ? (
                      <span className="badge known"><span className="dot" /> Known · {report.known.name} ({report.known.kind})</span>
                    ) : report ? (
                      <span className="badge unknown"><span className="dot" />
                        {report.movers > 0 ? `${report.movers} mover${report.movers === 1 ? '' : 's'} · top ${report.top_sigma.toFixed(1)}σ`
                          : report.variables > 0 || report.variable_flag ? 'Variable candidate' : 'Unidentified, needs review'}
                      </span>
                    ) : (
                      <span className="badge unknown"><span className="dot" /> Unidentified, needs review</span>
                    )}
                  </div>
                  <p className="story">{viewing.story}</p>
                  <h3>Frame</h3>
                  <RailHistogram watch={[epochIdx, compareMode, band, viewing.id]} />
                  <p className="fine">
                    {detStats
                      ? detStats.movers + detStats.variables > 0
                        ? `${detStats.movers} mover${detStats.movers === 1 ? '' : 's'}, ${detStats.variables} variable${detStats.variables === 1 ? '' : 's'} ≥5σ in this pair.`
                        : 'No movers above 5σ between these epochs — quiet field.'
                      : 'Scanning pixels for movers…'}
                  </p>
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
                  <h3>Spectrum</h3>
                  <BandSpectrum viewing={viewing} sample={sample} liveSpec={liveSpec} band={band} />
                </>
              )}
              {tab === 'epochs' && (
                <>
                  <div className="epoch-list">
                    {epochs.map((e, i) => (
                      <button key={`${e.label}::${i}`} type="button" onClick={() => setEpochIdx(i)}
                        className={`epoch-item${i === epochIdx ? ' active' : ''}`} aria-pressed={i === epochIdx}>
                        <span>{e.label}</span>
                        <span className="mono">{e.mjd ? mjdToDate(e.mjd) : ''}</span>
                      </button>
                    ))}
                  </div>
                  <p className="fine">Tip: the spectrum for the clicked spot now lives under Overview — always visible, no tab-hopping.</p>
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
                  <h3>Same sky, other eyes</h3>
                  <OtherEyes id={viewing.id} />
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
