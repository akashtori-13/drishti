'use client';

import { useEffect, useState } from 'react';
import { SedPlot } from '@/components/Plots';
import { swr } from '@/lib/cachefirst';

interface TrackPoint {
  band: number;
  wavelength_um: number | null;
  flux: number | null;
  flux_err: number | null;
  mjd: number | null;
  core_masked?: boolean | null;
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
    void swr<TrackDoc>(`sh-track:${trackId}`, `/tracks/${trackId}.json`, Infinity)
      .then((r) => { if (alive && r?.data && Array.isArray(r.data.points)) setDoc(r.data); })
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
  const nCoreMasked = doc.points.filter((p) => p.core_masked === true).length;
  return (
    <div>
      <h3>{title}</h3>
      {pts.length ? (
        <SedPlot points={pts.map((p) => ({
          wl: p.wavelength_um as number,
          flux: p.flux as number,
          err: p.flux_err ?? 0,
          masked: !((p.flux as number) > 0) || p.core_masked === true,
        }))} />
      ) : (
        <p className="fine">No measured spectrum — metadata only.</p>
      )}
      <p className="fine">{note} {doc.n_points}/{doc.n_attempted} cutouts measured · {span}
        {nCoreMasked ? ` · ${nCoreMasked} hollow: core pixel masked, excluded from evolution tests.` : '.'}</p>
    </div>
  );
}
