'use client';

import { useEffect, useState } from 'react';
import BlinkComparator from '@/components/BlinkComparator';
import Icon from '@/components/Icon';
import { SHOWCASE_IDS, getShowcase, skybotMatches, type Showcase } from '@/lib/showcases';
import { useAppStore } from '@/lib/store';
import { fmtDec, fmtRa } from '@/lib/sky';

/** Blink view: player + aside (metadata, epochs, cross-match, provenance). */
export default function BlinkPage() {
  const { showcaseId, openShowcase, setCurrentView } = useAppStore();
  const [data, setData] = useState<Showcase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [band, setBand] = useState(3);
  const [skybot, setSkybot] = useState<Array<{ name: string }> | null>(null);
  const viewing = data && data.id === showcaseId ? data : null;

  useEffect(() => {
    let alive = true;
    getShowcase(showcaseId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setErr(null);
        setBand(d.epochs[0]?.band ?? 3);
        setSkybot(null);
        const mjd = d.epochs[0]?.mjd;
        if (mjd) void skybotMatches(d.ra, d.dec, mjd).then((m) => { if (alive) setSkybot(m); });
      })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [showcaseId]);

  return (
    <div className="blink-layout">
      <button type="button" className="back" onClick={() => setCurrentView('sky')}>
        <Icon name="back" /><span>Back to sky map</span>
      </button>

      <div className="flex flex-wrap gap-2 mb-6">
        {SHOWCASE_IDS.map((s) => (
          <button
            key={s} type="button" onClick={() => openShowcase(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${showcaseId === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-slate-700 text-slate-300'}`}
          >
            {s}
          </button>
        ))}
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
            <BlinkComparator
              key={viewing.id}
              title={viewing.title}
              frames={viewing.epochs.map((e) => ({
                label: e.label, png: e.png, note: e.note, obs_id: e.obs_id, mjd: e.mjd,
              }))}
              band={band}
              onBandChange={setBand}
            />

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
                  <dt>Pixel scale</dt><dd>6.2″/px</dd>
                </dl>
              </section>
              <section>
                <h2>Epochs in this blink</h2>
                <div className="epoch-row">
                  {viewing.epochs.map((e) => (
                    <span key={e.label} className="epoch-chip">{e.label}</span>
                  ))}
                </div>
              </section>
              <section>
                <h2>Solar-system cross-match</h2>
                <p>
                  {skybot === null
                    ? 'Checked against SkyBoT when the dev API is live; static mode shows showcase notes.'
                    : skybot.length
                      ? `SkyBoT match: ${skybot[0].name}.`
                      : 'No cataloged object within the search radius — possibly an artifact or uncatalogued.'}
                </p>
                {viewing.epochs[0]?.note && <p style={{ marginTop: 8 }}>{viewing.epochs[0].note}</p>}
              </section>
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
        </>
      )}
    </div>
  );
}
