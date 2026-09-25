'use client';

/** Real per-band spectrum when `waves` is given, else epoch proxy. */
export default function SpectrumPlot({ values, band, waves }: {
  values: number[]; band: number; waves?: number[];
}) {
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mini spectrum, detector D${band}`} style={{ width: '100%', background: '#04050a', borderRadius: 10 }}>
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
            <text x={p.x} y={H - 2} fontSize={8} fill="#8a90ab" textAnchor="middle">
              {waves && waves[i] !== undefined ? waves[i].toFixed(1) : `E${i + 1}`}
            </text>
          </g>
        ))}
        <text x={4} y={12} fontSize={9} fill="#8a90ab">flux</text>
      </svg>
      <p style={{ fontSize: 11, color: '#8a90ab', marginTop: 6 }}>
        {waves
          ? 'Sampled center brightness per detector band from real cutouts (proxy spectrum).'
          : 'Sampled image brightness per epoch (proxy). Full 102-channel spectrum arrives with live per-pixel spectra.'}
      </p>
    </div>
  );
}

/** Measured SED: flux vs wavelength with error bars from report spectra.
 *  Masked points (zero/unmeasured flux) render hollow and never set the scale;
 *  an all-masked set renders the honest empty state instead of a flat line. */
export function SedPlot({ points }: {
  points: Array<{ wl: number; flux: number; err: number; masked: boolean }>;
}) {
  const W = 280;
  const H = 132;
  const real = points.filter((p) => !p.masked);
  if (!real.length) {
    return <p style={{ fontSize: 11, color: '#8a90ab', margin: '6px 0' }}>
      No measured spectrum — metadata only.</p>;
  }
  const ws = real.map((p) => p.wl);
  const fs = real.map((p) => p.flux);
  const lo = Math.min(...ws);
  const hi = Math.max(...ws);
  const span = Math.max(1e-9, hi - lo);
  const fmin = Math.min(...fs);
  const fmax = Math.max(...fs);
  const fspan = Math.max(1e-9, fmax - fmin);
  const X = (wl: number) => 34 + ((wl - lo) / span) * (W - 46);
  const Y = (f: number) => H - 24 - ((f - fmin) / fspan) * (H - 44);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Measured spectrum, ${real.length} bands with uncertainties`}
        style={{ width: '100%', background: '#04050a', borderRadius: 10 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={34} x2={W - 6} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
        ))}
        <polyline
          points={real.map((p) => `${X(p.wl)},${Y(p.flux)}`).join(' ')}
          fill="none" stroke="#7c83fd" strokeWidth={2}
        />
        {points.map((p, i) => (
          <g key={i}>
            <line x1={X(p.wl)} x2={X(p.wl)}
              y1={Y(Math.max(fmin, Math.min(fmax, p.flux - p.err)))}
              y2={Y(Math.max(fmin, Math.min(fmax, p.flux + p.err)))}
              stroke={p.masked ? 'rgba(138,144,171,.5)' : '#eef0f8'} strokeWidth={1.5} />
            <circle cx={X(p.wl)} cy={Y(Math.max(fmin, Math.min(fmax, p.flux)))} r={3.5}
              fill={p.masked ? '#04050a' : '#4fc9a8'}
              stroke={p.masked ? '#8a90ab' : 'none'} strokeWidth={1.5} />
            <text x={X(p.wl)} y={H - 8} fontSize={8} fill="#8a90ab" textAnchor="middle">
              {p.wl.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={6} y={14} fontSize={9} fill="#8a90ab">flux</text>
        <text x={W - 8} y={14} fontSize={9} fill="#8a90ab" textAnchor="end">µm</text>
      </svg>
      <p style={{ fontSize: 11, color: '#8a90ab', marginTop: 6 }}>
        Measured per-band flux with uncertainties{points.some((p) => p.masked) ? ' — hollow points masked.' : '.'}
      </p>
    </div>
  );
}

/** Brightness-vs-time light curve for the flagged candidate.
 *  Axes labeled honestly: x = visit date, y = aperture flux (arbitrary units).
 *  With two visits the "curve" is a segment — it deepens as more epochs land. */
export function LightCurve({ mjds, values, real }: {
  mjds: Array<number | undefined>; values: number[]; real?: boolean;
}) {
  const W = 280;
  const H = 124;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1e-6, max - min);
  const fmtDate = (mjd?: number) => {
    if (mjd === undefined) return '';
    const d = new Date((mjd - 40587) * 86400000);
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
  };
  const pts = values.map((v, i) => ({
    x: values.length > 1 ? (i / (values.length - 1)) * (W - 52) + 36 : W / 2,
    y: H - 26 - ((v - min) / span) * (H - 52),
    mjd: mjds[i],
  }));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Light curve: aperture flux versus visit date, ${values.length} visits`} style={{ width: '100%', background: '#04050a', borderRadius: 10 }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={36} x2={W - 8} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
        ))}
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e8c34a" strokeWidth={2} />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="#fff" />
            <text x={p.x} y={H - 11} fontSize={8} fill="#8a90ab" textAnchor="middle">{p.mjd !== undefined ? fmtDate(p.mjd) : `E${i + 1}`}</text>
          </g>
        ))}
        <text x={6} y={14} fontSize={9} fill="#8a90ab">flux</text>
        <text x={W - 8} y={H - 11} fontSize={9} fill="#8a90ab" textAnchor="end">date →</text>
      </svg>
      <p style={{ fontSize: 11, color: '#8a90ab', marginTop: 6 }}>
        {real
          ? `Aperture flux (arbitrary units) across ${values.length} visits.`
          : `Sampled image brightness across ${values.length} visit${values.length === 1 ? '' : 's'} — a proxy until live pipeline photometry loads.`}
      </p>
    </div>
  );
}
