'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Reveal } from '@/lib/reveal';
import { BANDS } from '@/lib/sky';
import { TOURS, GLOSSARY } from '@/lib/catalogs';
import { useAppStore } from '@/lib/store';
import { OrbitFinale } from '@/components/OrbitFinale';
import { parseTLE, telemetryFor, type SwarmBundle } from '@/lib/orbit';
import FALLBACK from '@/lib/tle-bundle.fallback.json';

const fallback = FALLBACK as SwarmBundle;

/** Honest one-shot mission state from the bundled TLE. Null hides the strip. */
function liveStripOnce(): string | null {
  try {
    const hero = fallback.objects.find((o) => o.hero) ?? fallback.objects[0];
    if (!hero) return null;
    const sat = parseTLE(hero.l1, hero.l2);
    if (!sat) return null;
    const t = telemetryFor({ obj: hero, sat });
    if (!t) return null;
    const age = Math.max(0, Math.round(t.tleAgeDays));
    return `SPHEREx NOW · ALT ${t.altKm.toFixed(1)} KM · V ${t.velKmS.toFixed(2)} KM/S · INC ${t.incDeg.toFixed(1)}° · TLE age ${age}d`;
  } catch {
    return null;
  }
}

export default function MissionPage() {
  const openPreview = useAppStore((s) => s.openPreview);
  // Client-only: telemetry reads the clock, so server and client renders
  // would mismatch (hydration error). Mount with null, fill in after.
  const [liveStrip, setLiveStrip] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveStrip(liveStripOnce());
  }, []);
  return (
    <>
    <div className="prose" style={{ position: 'relative', zIndex: 1 }}>
      <p className="hero-kicker">Mission · method · data</p>
      <h1>About STELLAR</h1>
      <p className="lede">STELLAR: SPHEREx Transient Explorer &amp; Light-spectrum Large-scale
        Archival Repository — a public blink comparator for the SPHEREx sky, built for the
        NASA Space Apps Challenge 2026 by team AKASHTORI.</p>
      {liveStrip ? <p className="mono" style={{ fontSize: 12, color: '#8a90ab', marginTop: 10 }}>{liveStrip}</p> : null}
      <p className="notice">
        Most fields below blink real SPHEREx cutouts on load. A few cells are
        still indexing (marked “cutout pending”) — coordinates and metadata are
        always real, and live mode fetches any visited field on demand.
      </p>

      <Reveal as="section" index={0}>
        <h2>What SPHEREx is watching for</h2>
        <p>
          SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization,
          and Ices Explorer) is a NASA all-sky survey observatory, imaging the entire sky
          roughly every six months across 102 near-infrared bands from 0.75 to 5 microns.
          Because it revisits the same sky repeatedly, anything that moves, brightens, or
          fades between visits stands out once you compare epochs directly: comets,
          asteroids, variable stars, and more.
        </p>
        <table className="band-table">
          <thead><tr><th scope="col"><span className="sr-only">Color</span></th><th scope="col">Band</th><th scope="col">Wavelength</th></tr></thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b.id}>
                <td><span className="sw" style={{ background: b.color }} /></td>
                <td>{b.label}</td>
                <td>{b.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <Reveal as="section" index={1}>
        <h2>How detection works</h2>
        <p>
          Each field with two or more same-band epochs gets aligned to a common grid,
          background-subtracted, and differenced. Whatever is left after masking bad pixels
          gets extracted. Real movers show up as paired bright-and-dark dipoles; noise and
          cosmic rays don&apos;t pair the same way. Every candidate is cross-checked against
          SkyBoT&apos;s catalog of known solar-system objects before it reaches the feed.
        </p>
        <p>
          One rule governs every blink: SPHEREx uses linear variable filters, so the same
          detector pixel sees a different wavelength depending on sky position. We only
          compare epochs whose wavelengths agree within half the local bandwidth.
        </p>
        <p>
          The numbers have units and error bars: 6.2″ pixels, aperture fluxes with
          uncertainties, light curves in MJD, six-band spectra in µm. Significance (σ)
          comes from aligned difference imaging — movers appear as paired bright-and-dark
          dipoles, and the in-browser detector flags them at ±5σ. Same-band enforcement
          lives in code (<span className="mono">cutouts.py: wavelengths_match</span>);
          unmeasured sky renders dark and says so instead of guessing.
        </p>
      </Reveal>

      <Reveal as="section" index={2}>
        <h2>Ground truth: we recover the known sky</h2>
        <p>Before trusting new candidates, we check the pipeline against targets whose
          positions are independently established. Field centers land sub-arcminute:</p>
        <table className="band-table">
          <thead><tr><th scope="col">Field</th><th scope="col">Target</th><th scope="col">Offset</th></tr></thead>
          <tbody>
            {[
              ['M31 field', 'M31', '0.2′'],
              ['Crab field', 'Crab Nebula (M1)', '0.3′'],
              ['LMC field', 'Large Magellanic Cloud', '0.2′'],
              ['SMC field', 'Small Magellanic Cloud', '0.1′'],
              ['Orion field', 'Orion Nebula (M42)', '0.1′'],
              ['Omega Cen field', 'Omega Centauri', '0.3′'],
              ['M51 field', 'Whirlpool Galaxy', '0.3′'],
              ['M101 field', 'Pinwheel Galaxy', '0.1′'],
              ['Galactic Center', 'Sgr A* region', '0.2′'],
            ].map(([f, t, o]) => (
              <tr key={f}><td>{f}</td><td>{t}</td><td className="mono">{o}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Moving targets verify differently: 3I/ATLAS matches the published SPHEREx
          characterization (Lisse et al., RNAAS 9:242 and follow-up), and solar-system
          suspects are checked against SkyBoT ephemerides at each exposure&apos;s MJD.</p>
      </Reveal>

      <Reveal as="section" index={3}>
        <h2>Impact: who this is for</h2>
        <p>
          Students meeting the infrared sky for the first time, amateur astronomers
          without archive-query expertise, and researchers who need a thirty-second
          look at a position before committing to a full IRSA session. Everything runs
          in a browser — including an 8&nbsp;MB offline Android build for places where
          bandwidth is scarce and wifi dies. Every measurement is reusable: candidates,
          light curves, and spectra ship as public JSON any app can fetch.
        </p>
      </Reveal>

      <Reveal as="section" index={4}>
        <h2>Team</h2>
        <p>
          Built by <strong style={{ color: '#fff' }}>Team AKASHTORI</strong> for the NASA
          Space Apps Challenge 2026 — build, research, and presenting split across the
          crew. Contributors and commit history are on{' '}
          <a href="https://github.com/akashtori-13/stellar" target="_blank" rel="noopener">GitHub</a>.
        </p>
      </Reveal>

      <Reveal as="section" index={5}>
        <h2>Guided tours</h2>
        <p>Short narrated paths through the app — the same fields you can blink yourself.</p>
        {TOURS.map((t) => (
          <div key={t.id} className="learn-card" style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--ink)', marginBottom: 6 }}>{t.title}</h3>
            <p>{t.blurb}</p>
            <ol style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'decimal', paddingLeft: 20 }}>
              {t.stops.map((s) => (
                <li key={s.id}><strong style={{ color: '#fff' }}>{s.title}</strong> — {s.caption}</li>
              ))}
            </ol>
          </div>
        ))}
      </Reveal>

      <Reveal as="section" index={6}>
        <h2>Glossary</h2>
        <dl className="gloss" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GLOSSARY.map((g) => (
            <div key={g.term}><dt style={{ color: '#fff', fontWeight: 600 }}>{g.term}</dt><dd style={{ color: 'var(--ink-2)' }}>{g.plain}</dd></div>
          ))}
        </dl>
      </Reveal>

      <Reveal as="section" index={7}>
        <h2>Required data citation</h2>
        <div className="cite-block">
          This publication makes use of data products from the Spectro-Photometer for the
          History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which
          is a joint project of the Jet Propulsion Laboratory and the California Institute
          of Technology, and is funded by the National Aeronautics and Space Administration.
        </div>
      </Reveal>

      <Reveal as="section" index={8}>
        <h2>Sources</h2>
        <ul className="source-list">
          <li><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noopener">SPHEREx archive at IRSA (NASA/IPAC)</a></li>
          <li><a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html" target="_blank" rel="noopener">SPHEREx Quick Release overview, IRSA</a></li>
          <li><a href="https://registry.opendata.aws/spherex-qr/" target="_blank" rel="noopener">SPHEREx Quick Release on AWS Open Data</a></li>
          <li><a href="https://gea.esac.esa.int/archive/" target="_blank" rel="noopener">Gaia DR3 (ESA) — star cross-matches</a></li>
          <li><a href="https://alasky.cds.unistra.fr/" target="_blank" rel="noopener">DSS2 and 2MASS sky imagery (CDS, Strasbourg)</a></li>
          <li><a href="https://simbad.cds.unistra.fr/simbad/" target="_blank" rel="noopener">SIMBAD astronomical database (CDS)</a></li>
          <li><a href="https://vo.imcce.fr/webservices/skybot/" target="_blank" rel="noopener">IMCCE SkyBoT, solar-system cone search</a></li>
          <li><a href="https://celestrak.org/" target="_blank" rel="noopener">CelesTrak — SPHEREx orbit elements (TLE)</a></li>
        </ul>
      </Reveal>

      <Reveal as="section" index={9}>
        <h2>Keyboard shortcuts</h2>
        <p>Every blink view answers to the keyboard: <kbd>Space</kbd> plays or pauses,
          <kbd>←</kbd> <kbd>→</kbd> step through epochs, <kbd>Ctrl/⌘ K</kbd> opens the
          command palette, <kbd>Esc</kbd> closes panels. Drag pans, scroll zooms.</p>
      </Reveal>

      <OrbitFinale>
      <Reveal as="section" className="cta-band" index={10}>
        <div>
          <h2>See for yourself</h2>
          <p style={{ margin: 0 }}>The whole sky is blinkable. Start with the comet.</p>
        </div>
        <div className="how-cta" style={{ marginTop: 0 }}>
          <Link className="btn primary" href="/sky">Open the sky map</Link>
          <button type="button" className="btn" onClick={() => openPreview('3i-atlas')}>Blink 3I/ATLAS</button>
          <Link className="btn" href="/intro">Watch the orbital intro</Link>
        </div>
      </Reveal>
      </OrbitFinale>
    </div>
    </>
  );
}
