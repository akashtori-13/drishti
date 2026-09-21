// Catalog helpers: direct Sesame/SIMBAD resolve (no backend needed),
// SkyBoT / MPC / Horizons / IRSA link builders, tours, glossary, surprise fields.

import { parseCoordinates, parseDMS, parseHMS, findConstellation, type RaDec } from '@/lib/astro';

export interface ResolveResult extends RaDec { name: string; source: string }

/** Direct CDS Sesame resolve in the browser (CORS-open). Returns null on miss. */
export async function resolveViaSesame(name: string, timeoutMs = 9000): Promise<ResolveResult | null> {
  const coord = parseCoordinates(name);
  if (coord) return { ...coord, name, source: 'coordinate' };
  const con = findConstellation(name);
  if (con) return { ra: con.ra, dec: con.dec, name: con.name, source: 'constellation' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  // 1) SIMBAD ASCII (stable format, CORS-open)
  try {
    const url = `https://simbad.cds.unistra.fr/simbad/sim-id?output.format=ASCII&Ident=${encodeURIComponent(name)}`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.ok) {
      const text = await r.text();
      const m = text.match(/Coordinates\(ICRS[^:]*:\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([+-])(\d+)\s+(\d+)\s+([\d.]+)/);
      if (m) {
        const ra = parseHMS(parseInt(m[1], 10), parseInt(m[2], 10), parseFloat(m[3]));
        const dec = parseDMS(m[4] === '-' ? -1 : 1, parseInt(m[5], 10), parseInt(m[6], 10), parseFloat(m[7]));
        return { ra, dec, name, source: 'simbad' };
      }
    }
  } catch { /* fall through to Sesame */ }
  // 2) CDS Sesame fallback
  try {
    const url = `https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oI/${encodeURIComponent(name)}`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    const text = await r.text();
    for (const line of text.split('\n')) {
      if (line.startsWith('%J')) {
        const m = line.match(/%J\s+([\d.]+)\s+([+-]?[\d.]+)/);
        if (m) {
          const ra = parseFloat(m[1]);
          const dec = parseFloat(m[2]);
          if (Number.isFinite(ra) && Number.isFinite(dec)) return { ra, dec, name, source: 'sesame' };
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const skybotURL = (ra: number, dec: number, mjd: number) =>
  `https://vo.imcce.fr/webservices/skybot/skybot_wrapper.php?EPOCH=${mjd - 2400000.5}&RA=${ra}&DEC=${dec}&SR=0.05`;
export const mpcCheckerURL = (ra: number, dec: number, mjd: number) =>
  `https://minorplanetcenter.net/cgi-bin/checkmp.cgi?RA=${ra.toFixed(4)}&Dec=${dec.toFixed(4)}&epoch=${mjd.toFixed(2)}`;
export const horizonsURL = (name: string) =>
  `https://ssd.jpl.nasa.gov/horizons/app.html#/?COMMAND='${encodeURIComponent(name)}'`;
export const simbadURL = (ra: number, dec: number) =>
  `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${ra}%20${dec}&CooFrame=ICRS&CooEpoch=2000&CooEqui=2000&Radius=2&Radius.unit=arcmin`;
export const irsaViewerURL = (ra: number, dec: number) =>
  `https://irsa.ipac.caltech.edu/irsaviewer/?ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}`;

// ---------- surprise / guided content (real coordinates, honest labels) ----------
export interface TourStop { id: string; title: string; ra: number; dec: number; caption: string; showcaseId?: string }
export const SURPRISE_FIELDS: TourStop[] = [
  { id: '3i-atlas', title: '3I/ATLAS — interstellar comet', ra: 252.6633, dec: -17.4904, caption: 'Two SPHEREx visits, months apart. Blink them.', showcaseId: '3i-atlas' },
  { id: 'eros', title: '433 Eros — slow asteroid', ra: 210.32, dec: 9.11, caption: 'A known near-Earth asteroid field on the ecliptic.' },
  { id: 'orion', title: 'Orion Complex — star factory', ra: 83.82, dec: -5.39, caption: 'Bright nebula, young variable stars.' },
  { id: 'nep', title: 'North Ecliptic Pole Deep Field', ra: 270.0, dec: 66.5, caption: 'Hundreds of visits. Best place to hunt variables.', showcaseId: 'nep-deep' },
  { id: 'galcenter', title: 'Galactic Center', ra: 266.42, dec: -29.01, caption: 'Crowded, dusty — variables everywhere.' },
  { id: 'lmc', title: 'Large Magellanic Cloud', ra: 80.89, dec: -69.76, caption: 'A whole galaxy next door, full of Cepheids.' },
];
export function surpriseField(): TourStop {
  return SURPRISE_FIELDS[Math.floor(Math.random() * SURPRISE_FIELDS.length)];
}

export interface Tour { id: string; title: string; blurb: string; stops: TourStop[] }
export const TOURS: Tour[] = [
  {
    id: 'comet', title: 'Catch a comet', blurb: 'How a moving icy body looks when you blink two epochs.',
    stops: [
      { id: 't1', title: '3I/ATLAS, Aug 2025', ra: 252.6633, dec: -17.4904, caption: 'Quiet coma: mostly CO₂. Note the epoch label.', showcaseId: '3i-atlas' },
      { id: 't2', title: 'Same comet, Dec 2025', ra: 166.9781, dec: 5.2264, caption: 'Erupting: water, organics, dust tail. Compare brightness.' },
    ],
  },
  {
    id: 'asteroid', title: 'Hunt an asteroid', blurb: 'Ecliptic fields are the highway. Look for the dot that jumps.',
    stops: [
      { id: 'a1', title: 'Ecliptic plane', ra: 180, dec: 0, caption: 'Main-belt asteroids drift ~arcminutes/day.', showcaseId: 'ecliptic-mover' },
      { id: 'a2', title: '433 Eros field', ra: 210.32, dec: 9.11, caption: 'Toggle Difference mode: stationary stars vanish.' },
    ],
  },
  {
    id: 'variable', title: 'Spot a variable star', blurb: 'Same position, changing brightness — check the light curve.',
    stops: [
      { id: 'v1', title: 'Orion Complex', ra: 83.82, dec: -5.39, caption: 'Young stars flicker. Compare epoch chips.' },
      { id: 'v2', title: 'NEP Deep Field', ra: 270, dec: 66.5, caption: 'Deep stacks go faintest. Variables pop in diff.', showcaseId: 'nep-deep' },
    ],
  },
];

export interface GlossaryTerm { term: string; plain: string }
export const GLOSSARY: GlossaryTerm[] = [
  { term: 'Epoch', plain: 'One visit to the same sky at a specific date. Blinking compares epochs.' },
  { term: 'Band', plain: 'A slice of infrared color. SPHEREx has 6 detectors × 17 channels = 102 bands, 0.75–5 µm.' },
  { term: 'RA / Dec', plain: 'Sky longitude/latitude in degrees (or hours/minutes). RA 0–360°, Dec −90°…+90°.' },
  { term: 'False color', plain: 'Mapping invisible infrared bands to red/green/blue so eyes can see them.' },
  { term: 'Difference image', plain: 'Epoch B minus Epoch A. Still things cancel; movers leave a bright+dark pair.' },
  { term: 'Light curve', plain: 'Brightness vs time for one spot. Variables go up and down.' },
  { term: 'SkyBoT', plain: 'A service listing known asteroids/comets at any sky position and date.' },
  { term: 'LVF', plain: 'Linear variable filter: wavelength changes across the detector, so we only blink same-band visits.' },
];
