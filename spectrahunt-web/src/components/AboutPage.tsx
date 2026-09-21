'use client';

export default function AboutPage() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">About SpectraHunt</h1>

        <section className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="font-semibold mb-2">What it is</h2>
          <p className="text-sm text-slate-300">
            Since 2025, NASA&apos;s SPHEREx mission maps the whole sky every six months in
            102 near-infrared bands. Comets, asteroids and variable stars reveal themselves
            by shifting between visits. SpectraHunt is a public blink comparator: same sky,
            different time, drag the slider.
          </p>
        </section>

        <section className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="font-semibold mb-2">The one rule that matters</h2>
          <p className="text-sm text-slate-300">
            SPHEREx uses linear variable filters: the same detector pixel sees a different
            wavelength depending on sky position. We only blink <strong>same-band epochs</strong>
            {' '}(|Δλ| &lt; ½ bandwidth) — otherwise stellar colors fake motion.
          </p>
        </section>

        <section className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="font-semibold mb-2">Data</h2>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>· SPHEREx Quick Release 2 via IRSA (weekly; QR3 next)</li>
            <li>· Discovery: TAP <span className="font-mono text-xs">spherex.artifact ⋈ spherex.plane</span>, SIA2 fallback</li>
            <li>· Pixels: IBE cutouts <span className="font-mono text-xs">?center=RA,Dec&amp;size=deg</span>, zscale PNGs</li>
            <li>· Context: Aladin Lite / DSS2 HiPS · Cross-checks: SkyBoT, MPC, Sesame</li>
          </ul>
        </section>

        <section className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="font-semibold mb-2">Citation</h2>
          <p className="text-xs font-mono text-slate-300">
            This publication makes use of data products from SPHEREx (JPL/Caltech, NASA).
            DOI: 10.26131/IRSA652 (QR2).
          </p>
          <div className="text-sm mt-3 space-y-1">
            <a className="block text-blue-400 hover:underline" target="_blank" rel="noreferrer" href="https://irsa.ipac.caltech.edu/Missions/spherex.html">→ SPHEREx at IRSA</a>
            <a className="block text-blue-400 hover:underline" target="_blank" rel="noreferrer" href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/">→ 3I/ATLAS observations</a>
            <a className="block text-blue-400 hover:underline" target="_blank" rel="noreferrer" href="https://registry.opendata.aws/spherex-qr/">→ AWS Open Data</a>
          </div>
        </section>
      </div>
    </div>
  );
}
