import Link from 'next/link';

const LAYERS: { source: string; use: string }[] = [
  { source: 'SPHEREx QR2 · NASA/IPAC IRSA', use: 'Every cutout pixel, epoch count, MJD and band (DOI 10.26131/IRSA652).' },
  { source: 'CDS Strasbourg HiPS (DSS2 + 2MASS)', use: 'Base imagery and the all-sky map behind the coverage cells.' },
  { source: 'ESA Gaia DR3', use: 'Star cross-matches, observer overlays and G magnitudes.' },
  { source: 'SIMBAD / Sesame (CDS)', use: 'Resolving typed object names to sky positions.' },
  { source: 'IMCCE SkyBoT · MPC · JPL Horizons', use: 'Solar-system cross-checks at the exposure time.' },
  { source: 'CelesTrak TLEs', use: 'The live SPHEREx orbit in the cinematic intro.' },
  { source: 'Yale Bright Star Catalog v5', use: 'The 1,627-star layer on the home sky map.' },
];

/** The About view: what DRISHTI is, where its numbers come from, and who built it. */
export default function AboutPage() {
  return (
    <div className="prose" style={{ position: 'relative', zIndex: 1 }}>
      <p className="hero-kicker">About · data · people</p>
      <h1>About DRISHTI</h1>
      <p className="lede">
        DRISHTI — Dynamic Repository for Infrared Spectral History and Transient
        Inspection — is a public blink comparator for the SPHEREx all-sky survey.
        Search any object or sky position, then blink between epochs to see what
        changed. Built for the NASA Space Apps Challenge 2026 by team AKASHTORI.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/about/spherex-hero.webp"
        alt="Artist's view of the SPHEREx spacecraft above the Earth"
        width={720}
        style={{ display: 'block', width: '100%', maxWidth: 720, height: 'auto', borderRadius: 12, margin: '20px 0' }}
      />

      <p className="notice">
        Honesty rule: every pixel, number and field traces to IRSA data or a local
        cache of it. Unmeasured sky renders dark and says so. Simulated views are
        labelled as interpretation — nothing is fabricated.
      </p>

      <h2>The idea in three clicks</h2>
      <p>
        Since 2025, SPHEREx has mapped the entire sky every six months in 102
        near-infrared bands. Comets, asteroids, stars and brown dwarfs reveal
        themselves by <em>shifting between visits</em>. DRISHTI makes that shift
        visible: <strong>search</strong> a field, <strong>pick</strong> it on the
        sky map, then <strong>drag the blink slider</strong>. The current bundle
        holds 20 fields, 143 epochs, 240 cutouts, 20 measurement reports and a
        2,590-cell measured sky census.
      </p>

      <h2>Same sky, different time</h2>
      <p>
        SPHEREx&apos;s linear variable filter means one pixel sees a different
        wavelength on each pointing. We therefore blink <strong>same-band epochs
        only</strong> (|Δλ| &lt; ½ bandwidth), enforced when the showcase index is
        built. A moving object appears as an adjacent positive/negative pair;
        a variable source changes brightness without moving. Both are measured
        with aperture photometry and cross-matched against catalogues — never
        guessed.
      </p>

      <h2>Every number names its source</h2>
      <table>
        <thead>
          <tr><th>Source</th><th>Where it appears</th></tr>
        </thead>
        <tbody>
          {LAYERS.map((l) => (
            <tr key={l.source}><td>{l.source}</td><td>{l.use}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>The people</h2>
      <p>
        Six people — systems, frontend, research, communications, quality and
        science review — built the pipeline, the viewer and the story. Meet them
        on the <Link href="/crew">Crew</Link> page. The method, band table, tours
        and glossary live on the <Link href="/mission">Mission</Link> page.
      </p>

      <h2>Cite the data</h2>
      <p>
        This publication makes use of data products from SPHEREx (JPL/Caltech,
        NASA), processed by IRSA (IPAC). DOI{' '}
        <a href="https://doi.org/10.26131/IRSA652" target="_blank" rel="noreferrer">
          10.26131/IRSA652
        </a>
        . The app is MIT licensed with required SPHEREx/IRSA attribution.
      </p>

      <p className="mono" style={{ fontSize: 12, marginTop: 24 }}>
        <Link href="/settings">App preferences</Link>
      </p>
    </div>
  );
}
