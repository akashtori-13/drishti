'use client';

import { CHANNELS } from '@/lib/astro';

/** Flux vs wavelength mini-plot from sampled frame brightness. Honest label: proxy until per-pixel spectra land. */
export default function SpectrumPlot({ values, band }: { values: number[]; band: number }) {
  const W = 280;
  const H = 120;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (W - 40) + 30;
    const y = H - 14 - (v / max) * (H - 34);
    return { x, y, v };
  });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mini spectrum: sampled brightness vs epoch" style={{ width: '100%', background: '#04050a', borderRadius: 10 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={30} x2={W - 6} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
        ))}
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#7c83fd" strokeWidth={2}
        />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={i === 0 ? '#4fc9a8' : '#e8c34a'} />
            <text x={p.x} y={H - 2} fontSize={8} fill="#8a90ab" textAnchor="middle">E{i + 1}</text>
          </g>
        ))}
        <text x={4} y={12} fontSize={9} fill="#8a90ab">flux</text>
      </svg>
      <p style={{ fontSize: 11, color: '#8a90ab', marginTop: 6 }}>
        Sampled image brightness per epoch (proxy). Full 102-channel spectrum ({CHANNELS.length} channels, D{band}) arrives with live per-pixel spectra.
      </p>
    </div>
  );
}

/** Brightness-vs-time light curve for the flagged candidate. */
export function LightCurve({ mjds, values }: { mjds: Array<number | undefined>; values: number[] }) {
  const W = 280;
  const H = 110;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1e-6, max - min);
  const pts = values.map((v, i) => ({
    x: (i / Math.max(1, values.length - 1)) * (W - 40) + 30,
    y: H - 16 - ((v - min) / span) * (H - 36),
    mjd: mjds[i],
  }));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Light curve: brightness vs time" style={{ width: '100%', background: '#04050a', borderRadius: 10 }}>
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e8c34a" strokeWidth={2} />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="#fff" />
            <text x={p.x} y={H - 3} fontSize={8} fill="#8a90ab" textAnchor="middle">{p.mjd ? String(Math.round(p.mjd)).slice(2) : `E${i + 1}`}</text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: 11, color: '#8a90ab', marginTop: 6 }}>Brightness vs time at the candidate position.</p>
    </div>
  );
}
