'use client';

import { useEffect, useState } from 'react';
import { SedPlot } from '@/components/Plots';

interface TrackPoint {
  band: number;
  wavelength_um: number | null;
  flux: number | null;
  flux_err: number | null;
  mjd: number | null;
}

interface TrackDoc {
  target: string;
  n_points: number;
  n_attempted: number;
  points: TrackPoint[];
}

/** Measured multi-band spectrum from scripts/extract_track.py output.
 *  Renders nothing until /tracks/{trackId}.json exists, so pages stay
 *  clean before data lands. Masked/failed points never set the scale. */
export default function TrackSpectrum({ trackId, title, note }: {
  trackId: string; title: string; note: string;
}) {
  const [doc, setDoc] = useState<TrackDoc | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/tracks/${trackId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && Array.isArray(j.points)) setDoc(j); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [trackId]);
  if (!doc) return null;
  const pts = doc.points.filter((p) => p.flux !== null && p.wavelength_um);
  const mjds = doc.points
    .map((p) => p.mjd)
    .filter((m): m is number => typeof m === 'number');
  const span = mjds.length
    ? `MJD ${Math.min(...mjds).toFixed(1)}–${Math.max(...mjds).toFixed(1)}`
    : 'MJD —';
  return (
    <div>
      <h3>{title}</h3>
      {pts.length ? (
        <SedPlot points={pts.map((p) => ({
          wl: p.wavelength_um as number,
          flux: p.flux as number,
          err: p.flux_err ?? 0,
          masked: !((p.flux as number) > 0),
        }))} />
      ) : (
        <p className="fine">No measured spectrum — metadata only.</p>
      )}
      <p className="fine">{note} {doc.n_points}/{doc.n_attempted} cutouts measured · {span}.</p>
    </div>
  );
}
