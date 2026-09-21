'use client';

export default function AboutPage() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">About SpectraHunt</h1>

        <div className="space-y-8">
          {/* Mission */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">Mission</h2>
            <p className="text-slate-300">
              SpectraHunt is a web tool for discovering moving objects (asteroids, comets) 
              in SPHEREx spectral survey data using difference imaging techniques. Built for 
              the 2026 NASA Space Apps Challenge.
            </p>
          </section>

          {/* Data Sources */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">Data Sources</h2>
            <ul className="space-y-2 text-slate-300">
              <li>• <strong>SPHEREx QR2</strong> - All-sky spectral survey (0.75-5.0 µm, 102 bands)</li>
              <li>• <strong>IRSA Archive</strong> - NASA/IPAC Infrared Science Archive</li>
              <li>• <strong>SkyBoT</strong> - IMCCE solar system object database</li>
              <li>• <strong>JPL Horizons</strong> - Ephemeris calculations</li>
            </ul>
          </section>

          {/* How Detection Works */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">How Detection Works</h2>
            <ol className="space-y-3 text-slate-300 list-decimal list-inside">
              <li>Fetch wavelength-matched epoch pairs from SPHEREx frames</li>
              <li>Reproject to common WCS grid and subtract backgrounds</li>
              <li>Compute difference images (epoch B − epoch A)</li>
              <li>Extract sources with SEP on both positive and negative residuals</li>
              <li>Pair dipole signatures (positive+negative blobs)</li>
              <li>Cross-match with SkyBoT for known object identification</li>
              <li>Score and rank candidates by significance and quality</li>
            </ol>
          </section>

          {/* Limitations */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">Known Limitations</h2>
            <ul className="space-y-2 text-slate-300">
              <li>• Wavelength matching required due to LVF design (may reject valid pairs)</li>
              <li>• Sparse epochs in some sky regions limit detection sensitivity</li>
              <li>• Cosmic rays and diffraction spikes cause false positives</li>
              <li>• SkyBoT completeness varies for faint objects</li>
              <li>• IRSA SIA2 service lags new ingests by ~1 day</li>
            </ul>
          </section>

          {/* Citation */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">Citation</h2>
            <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm text-slate-300">
              <p className="mb-2">
                This publication makes use of data products from the Spectro-Photometer for 
                the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), 
                which is a joint project of the Jet Propulsion Laboratory and the California 
                Institute of Technology, and is funded by the National Aeronautics and Space Administration.
              </p>
              <p className="text-slate-400">
                DOI: 10.26131/IRSA652 (QR2) • 10.26131/IRSA629 (QR1)
              </p>
            </div>
          </section>

          {/* Links */}
          <section className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold mb-3">Links</h2>
            <div className="space-y-2">
              <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                → SPHEREx Documentation (IRSA)
              </a>
              <a href="https://www.ipac.caltech.edu/spherex" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                → SPHEREx Mission Website
              </a>
              <a href="https://skybot.imcce.fr/" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                → SkyBoT Solar System Database
              </a>
              <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:underline">
                → JPL Horizons Ephemeris
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
