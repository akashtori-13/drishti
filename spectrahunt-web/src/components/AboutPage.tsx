'use client';

import { BANDS } from '@/lib/sky';
import { TOURS, GLOSSARY } from '@/lib/catalogs';

export default function AboutPage() {
  return (
    <div className="prose">
      <h1>About SpectraHunt</h1>
      <p className="lede">A public blink comparator for the SPHEREx sky, built for the 2026 NASA Space Apps Challenge.</p>
      <p className="notice">
        Live cutout PNGs fill in as the indexer runs against IRSA. Until then, viewers render
        illustrative placeholders — the stories, coordinates, and metadata are real.
      </p>

      <section>
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
      </section>

      <section>
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
      </section>

      <section>
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
      </section>

      <section>
        <h2>Glossary</h2>
        <dl className="gloss" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GLOSSARY.map((g) => (
            <div key={g.term}><dt style={{ color: '#fff', fontWeight: 600 }}>{g.term}</dt><dd style={{ color: 'var(--ink-2)' }}>{g.plain}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Required data citation</h2>
        <div className="cite-block">
          This publication makes use of data products from the Spectro-Photometer for the
          History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which
          is a joint project of the Jet Propulsion Laboratory and the California Institute
          of Technology, and is funded by the National Aeronautics and Space Administration.
        </div>
      </section>

      <section>
        <h2>Sources</h2>
        <ul className="source-list">
          <li><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noopener">SPHEREx archive at IRSA</a></li>
          <li><a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html" target="_blank" rel="noopener">SPHEREx Quick Release overview, IRSA</a></li>
          <li><a href="https://registry.opendata.aws/spherex-qr/" target="_blank" rel="noopener">SPHEREx Quick Release on AWS Open Data</a></li>
          <li><a href="https://vo.imcce.fr/webservices/skybot/" target="_blank" rel="noopener">IMCCE SkyBoT, solar-system cone search</a></li>
        </ul>
      </section>
    </div>
  );
}
