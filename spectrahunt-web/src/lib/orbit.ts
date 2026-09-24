// Real-satellite math for the BORESIGHT orbital intro (docs/ORBITAL_INTRO.md).
//
// Near-earth SGP4 (Vallado/Hoots-Roehrich, WGS-72 constants) hand-ported so
// the intro ships zero new runtime deps. Deep-space TLEs (period >= 225 min,
// e.g. GEO) and near-equatorial orbits (inclination < 0.2 rad, where the
// Lyddane branch would be needed) are refused with a typed error — honest
// nulls, never fake positions (spectrahunt-ui honesty rule).
//
// Accuracy: ~km of a reference SGP4 near epoch, degrading with TLE age —
// far below a pixel at intro zoom. The TLE epoch age is exposed so the HUD
// can label staleness honestly.

const TWOPI = Math.PI * 2;
const DEG = Math.PI / 180;

// Vallado canonical constants (earth radius 6378.135 km, minutes)
const XKE = 0.0743669161;
const CK2 = 5.41308e-4; // J2 / 2
const CK4 = 0.62098875e-6; // -3 J4 / 8
const QOMS2T = 1.88027916e-9;
const S = 1.01222928;
const J3OJ2 = -0.2270967e-3;
const RE_KM = 6378.135;
const ER_MIN_TO_KM_S = RE_KM / 60;
// WGS-84 for the ground display only
const WGS_A = 6378.137;
const WGS_F = 1 / 298.257223563;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SwarmObject {
  name: string;
  norad: number;
  cospar?: string;
  hero?: boolean;
  l1: string;
  l2: string;
}

export interface SwarmBundle {
  source: string;
  fetched_at: string;
  objects: SwarmObject[];
}

export type PropError = 'deep-space' | 'low-inclination' | 'decayed' | 'bad-elements';

export type PropResult = { ok: true; r: Vec3; v: Vec3 } | { ok: false; error: PropError };

export interface SatRec {
  satnum: string;
  jdsatepoch: number;
  bstar: number;
  ecco: number;
  argpo: number;
  inclo: number;
  mo: number;
  no: number; // kozai mean motion, rad/min (set by init)
  nodeo: number;
  isimp: number;
  aycof: number;
  c1: number;
  c4: number;
  c5: number;
  delmo: number;
  eta: number;
  omgcof: number;
  sinmo: number;
  t2cof: number;
  t3cof: number;
  t4cof: number;
  xmcof: number;
  nodecf: number;
  xmdot: number;
  omgdot: number;
  xnodot: number;
  xlcof: number;
  d2: number;
  d3: number;
  d4: number;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Julian date (Vallado jday). Month 1-12; day may carry the fraction. */
export function jday(year: number, mon: number, day: number, hr = 0, min = 0, sec = 0): number {
  return (
    367 * year -
    Math.floor((7 * (year + Math.floor((mon + 9) / 12))) / 4) +
    Math.floor((275 * mon) / 9) +
    day +
    1721013.5 +
    ((sec / 60 + min) / 60 + hr) / 24
  );
}

export function nowJD(at?: Date): number {
  return (at ?? new Date()).getTime() / 86400000 + 2440587.5;
}

export function mjdFromJD(jd: number): number {
  return jd - 2400000.5;
}

/** Greenwich sidereal time, radians (Vallado). */
export function gmst(jd: number): number {
  const tut1 = (jd - 2451545.0) / 36525;
  const temp =
    -6.2e-6 * tut1 * tut1 * tut1 +
    0.093104 * tut1 * tut1 +
    (876600 * 3600 + 8640184.812866) * tut1 +
    67310.54841;
  return ((((temp * DEG) / 240) % TWOPI) + TWOPI) % TWOPI;
}

/** Implied-decimal TLE field, e.g. " 98630-4" -> 0.09863e-3... -> 9.863e-5. */
function parseBstar(s: string): number {
  const m = s.match(/^\s*([+-]?)(\d+)([+-])(\d)\s*$/);
  if (!m) return NaN;
  const mant = parseInt(m[2], 10) / Math.pow(10, m[2].length);
  return (m[1] === '-' ? -1 : 1) * mant * Math.pow(10, (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10));
}

/** Parse a TLE pair into an initialized SGP4 record. Null when unusable. */
export function parseTLE(l1: string, l2: string): SatRec | null {
  try {
    if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') return null;
    const satnum = l1.substring(2, 7).trim();
    if (!satnum || l2.substring(2, 7).trim() !== satnum) return null;
    const epochYear2 = parseInt(l1.substring(18, 20), 10);
    const epochDay = parseFloat(l1.substring(20, 32));
    const bstar = parseBstar(l1.substring(53, 61));
    const inclo = parseFloat(l2.substring(8, 16));
    const nodeo = parseFloat(l2.substring(17, 25));
    const ecco = parseFloat(`0.${l2.substring(26, 33).trim()}`);
    const argpo = parseFloat(l2.substring(34, 42));
    const mo = parseFloat(l2.substring(43, 51));
    const motion = parseFloat(l2.substring(52, 63)); // rev/day
    if ([epochYear2, epochDay, bstar, inclo, nodeo, ecco, argpo, mo, motion].some((v) => !Number.isFinite(v))) return null;
    if (ecco < 0 || ecco >= 1 || motion <= 0) return null;
    const year = epochYear2 < 57 ? 2000 + epochYear2 : 1900 + epochYear2;
    const sat: SatRec = {
      satnum,
      jdsatepoch: jday(year, 1, 1) + (epochDay - 1),
      bstar,
      ecco,
      argpo: argpo * DEG,
      inclo: inclo * DEG,
      mo: mo * DEG,
      no: (motion * TWOPI) / 1440,
      nodeo: nodeo * DEG,
      isimp: 0,
      aycof: 0,
      c1: 0,
      c4: 0,
      c5: 0,
      delmo: 0,
      eta: 0,
      omgcof: 0,
      sinmo: 0,
      t2cof: 0,
      t3cof: 0,
      t4cof: 0,
      xmcof: 0,
      nodecf: 0,
      xmdot: 0,
      omgdot: 0,
      xnodot: 0,
      xlcof: 0,
      d2: 0,
      d3: 0,
      d4: 0,
    };
    return sgp4init(sat);
  } catch {
    return null;
  }
}

/** TLE epoch as a Date (for age labels and tests). */
export function epochDate(sat: SatRec): Date {
  return new Date((sat.jdsatepoch - 2440587.5) * 86400000);
}

/** Orbital period of a record, minutes. */
export function periodMin(sat: SatRec): number {
  return TWOPI / sat.no;
}

/** True for deep-space TLEs (would need SDP4 — refused honestly). */
export function isDeepSpace(sat: SatRec): boolean {
  return periodMin(sat) >= 225;
}

function sgp4init(sat: SatRec): SatRec | null {
  const { ecco, inclo, argpo, mo, bstar } = sat;
  const cosio = Math.cos(inclo);
  const sinio = Math.sin(inclo);
  const theta2 = cosio * cosio;
  const x3thm1 = 3 * theta2 - 1;
  const eosq = ecco * ecco;
  const betao2 = 1 - eosq;
  if (betao2 <= 0) return null;
  const betao = Math.sqrt(betao2);

  const a1 = Math.pow(XKE / sat.no, 2 / 3);
  const del1 = (1.5 * CK2 * x3thm1) / (a1 * a1 * betao * betao2);
  const ao = a1 * (1 - del1 * (1 / 3 + del1 * (1 + (134 / 81) * del1)));
  const delo = (1.5 * CK2 * x3thm1) / (ao * ao * betao * betao2);
  const no = sat.no / (1 + delo);
  const aodp = ao / (1 - delo);
  sat.no = no;

  // atmospheric model: simple drag below ~220 km perigee
  sat.isimp = aodp * (1 - ecco) < 1 + 220 / RE_KM ? 1 : 0;
  let s4 = S;
  let qzms24 = QOMS2T;
  const perige = (aodp * (1 - ecco) - 1) * RE_KM;
  if (perige < 156) {
    const sKm = perige < 98 ? 20 : perige - 78;
    s4 = sKm / RE_KM + 1; // canonical earth radii
    qzms24 = Math.pow((120 - sKm) / RE_KM, 4);
  }

  const pinvsq = 1 / (aodp * aodp * betao2 * betao2);
  const tsi = 1 / (aodp - s4);
  sat.eta = aodp * ecco * tsi;
  const etasq = sat.eta * sat.eta;
  const eeta = ecco * sat.eta;
  const psisq = Math.abs(1 - etasq);
  const coef = qzms24 * Math.pow(tsi, 4);
  const coef1 = coef / Math.pow(tsi, 3.5);
  const cc2 =
    coef1 *
    no *
    (aodp * (1 + 1.5 * etasq + eeta * (4 + etasq)) +
      ((0.375 * CK2 * tsi) / psisq) * x3thm1 * (8 + 3 * etasq * (8 + etasq)));
  sat.c1 = bstar * cc2;
  let cc3 = 0;
  if (ecco > 1e-4) cc3 = (-2 * coef * tsi * J3OJ2 * no * sinio) / ecco;
  const cosio4 = theta2 * theta2;
  const temp1 = 1.5 * CK2 * pinvsq * no;
  const temp2 = 0.5 * temp1 * CK2 * pinvsq;
  const temp3 = -0.46875 * CK4 * pinvsq * pinvsq * no;
  sat.xmdot = no + temp1 * 0.5 * betao * x3thm1 + temp2 * 0.0625 * betao * (13 - 78 * theta2 + 137 * cosio4);
  const x1m5 = 1 - 5 * theta2;
  sat.omgdot =
    -0.5 * temp1 * x1m5 + temp2 * 0.0625 * (7 - 114 * theta2 + 395 * cosio4) + temp3 * (3 - 36 * theta2 + 49 * cosio4);
  const xhdot = -temp1 * cosio;
  sat.xnodot = xhdot + (0.5 * temp2 * (4 - 19 * theta2) + 2 * temp3 * (3 - 7 * theta2)) * cosio;
  sat.omgcof = bstar * cc3 * Math.cos(argpo);
  sat.xmcof = ecco > 1e-4 ? (-2 / 3) * coef * bstar : 0;
  sat.nodecf = 3.5 * betao2 * xhdot * sat.c1;
  sat.t2cof = 1.5 * sat.c1;
  const denom = Math.abs(1 + cosio) > 1.5e-12 ? 1 + cosio : 1.5e-12;
  sat.xlcof = 0.125 * J3OJ2 * sinio * ((3 + 5 * cosio) / denom);
  sat.aycof = 0.25 * J3OJ2 * sinio;
  sat.delmo = Math.pow(1 + sat.eta * Math.cos(mo), 3);
  sat.sinmo = Math.sin(mo);

  const c1sq = sat.c1 * sat.c1;
  sat.d2 = 4 * aodp * tsi * c1sq;
  const d2temp = (sat.d2 * tsi * sat.c1) / 3;
  sat.d3 = (17 * aodp + s4) * d2temp;
  sat.d4 = 0.5 * d2temp * aodp * tsi * (221 * aodp + 31 * s4) * sat.c1;
  sat.t3cof = sat.d2 * tsi * sinio;
  sat.t4cof = (sat.d3 + sinio * (sat.d4 + sinio * sat.d2 * tsi)) * tsi * sinio;
  sat.c4 =
    2 *
    no *
    coef1 *
    aodp *
    betao2 *
    (sat.eta * (2 + 0.5 * etasq) +
      ecco * (0.5 + 2 * etasq) -
      ((2 * CK2 * tsi) / (aodp * psisq)) *
        (-3 * x3thm1 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) +
          0.75 * (7 * theta2 - 1) * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
  sat.c5 = 2 * coef1 * aodp * betao2 * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
  return sat;
}

/** Propagate to minutes-since-epoch. Pure; never throws. */
export function propagate(sat: SatRec, tsince: number): PropResult {
  if (!Number.isFinite(tsince)) return { ok: false, error: 'bad-elements' };
  if (isDeepSpace(sat)) return { ok: false, error: 'deep-space' };
  if (sat.inclo < 0.2) return { ok: false, error: 'low-inclination' };
  const { ecco, argpo, inclo, mo, nodeo } = sat;
  if (!(ecco >= 0 && ecco < 1)) return { ok: false, error: 'bad-elements' };

  const cosio = Math.cos(inclo);
  const sinio = Math.sin(inclo);
  const theta2 = cosio * cosio;
  const x3thm1 = 3 * theta2 - 1;
  const x1mth2 = 1 - theta2;
  const x7thm1 = 7 * theta2 - 1;

  // secular
  const xmdf = mo + sat.xmdot * tsince;
  const omgadf = argpo + sat.omgdot * tsince;
  const xnoddf = nodeo + sat.xnodot * tsince;
  let omega = omgadf;
  let xmp = xmdf;
  const tsq = tsince * tsince;
  const xnode = xnoddf + sat.nodecf * tsq;
  let tempa = 1 - sat.c1 * tsince;
  let tempe = sat.bstar * sat.c4 * tsince;
  let templ = sat.t2cof * tsq;
  if (sat.isimp !== 1) {
    const delomg = sat.omgcof * tsince;
    const delm = sat.xmcof * (Math.pow(1 + sat.eta * Math.cos(xmdf), 3) - sat.delmo);
    const msum = delomg + delm;
    xmp = xmdf + msum;
    omega = omgadf - msum;
    tempa = tempa - sat.d2 * tsince - sat.d3 * tsq - sat.d4 * tsince * tsq;
    tempe = tempe + sat.bstar * sat.c5 * (Math.sin(xmp) - sat.sinmo);
    templ = templ + sat.t3cof * tsq + sat.t4cof * tsince * tsq;
  }

  const no = sat.no;
  const a = Math.pow(XKE / no, 2 / 3) * tempa * tempa;
  const e = ecco - tempe;
  if (!(e >= 0 && e < 1)) return { ok: false, error: 'bad-elements' };
  const xl = xmp + omega + xnode + no * templ;
  const beta = Math.sqrt(Math.max(0, 1 - e * e));
  const xn = XKE / Math.pow(a, 1.5);

  // Kepler solve (Newton on the eccentric-longitude form)
  const axn = e * Math.cos(omega);
  const aynBase = e * Math.sin(omega);
  const llDenom = a * beta * beta;
  const xll = (sat.xlcof * axn) / llDenom;
  const aynl = sat.aycof / llDenom;
  const xlt = xl + xll;
  const ayn = aynBase + aynl;
  const capu = (((xlt - xnode) % TWOPI) + TWOPI) % TWOPI;
  let epw = capu;
  for (let i = 0; i < 10; i++) {
    const s = Math.sin(epw);
    const c = Math.cos(epw);
    const esine = axn * s - ayn * c;
    const ecose = axn * c + ayn * s;
    const next = epw + (capu - epw - esine) / (1 - ecose);
    if (Math.abs(next - epw) <= 1e-10) {
      epw = next;
      break;
    }
    epw = next;
  }
  const sinepw = Math.sin(epw);
  const cosepw = Math.cos(epw);
  const esine = axn * sinepw - ayn * cosepw;
  const ecose = axn * cosepw + ayn * sinepw;
  const elsq = axn * axn + ayn * ayn;
  if (elsq >= 1) return { ok: false, error: 'bad-elements' };
  const pl = a * (1 - elsq);
  if (pl <= 0) return { ok: false, error: 'bad-elements' };

  // short-period preliminaries
  const r = a * (1 - ecose);
  const invR = 1 / r;
  const rdot = XKE * Math.sqrt(a) * esine * invR;
  const rfdot = XKE * Math.sqrt(pl) * invR;
  const aInvR = a * invR;
  const betal = Math.sqrt(1 - elsq);
  const uDenom = 1 / (1 + betal);
  const cosu = aInvR * (cosepw - axn + ayn * esine * uDenom);
  const sinu = aInvR * (sinepw - ayn - axn * esine * uDenom);
  const u = Math.atan2(sinu, cosu);
  const sin2u = 2 * sinu * cosu;
  const cos2u = 2 * cosu * cosu - 1;
  const plInv = 1 / pl;
  const sp1 = CK2 * plInv;
  const sp2 = sp1 * plInv;

  const rk = r * (1 - 1.5 * sp2 * betal * x3thm1) + 0.5 * sp1 * x1mth2 * cos2u;
  if (rk < 1) return { ok: false, error: 'decayed' };
  const uk = u - 0.25 * sp2 * x7thm1 * sin2u;
  const xnodek = xnode + 1.5 * sp2 * cosio * sin2u;
  const xinck = inclo + 1.5 * sp2 * cosio * sinio * cos2u;
  const rdotk = rdot - xn * sp1 * x1mth2 * sin2u;
  const rfdotk = rfdot + xn * sp1 * (x1mth2 * cos2u + 1.5 * x3thm1);

  const sinuk = Math.sin(uk);
  const cosuk = Math.cos(uk);
  const sinik = Math.sin(xinck);
  const cosik = Math.cos(xinck);
  const sinnok = Math.sin(xnodek);
  const cosnok = Math.cos(xnodek);
  const xmx = -sinnok * cosik;
  const xmy = cosnok * cosik;
  const ux = xmx * sinuk + cosnok * cosuk;
  const uy = xmy * sinuk + sinnok * cosuk;
  const uz = sinik * sinuk;
  const vx = xmx * cosuk - cosnok * sinuk;
  const vy = xmy * cosuk - sinnok * sinuk;
  const vz = sinik * cosuk;
  return {
    ok: true,
    r: { x: rk * ux * RE_KM, y: rk * uy * RE_KM, z: rk * uz * RE_KM },
    v: {
      x: (rdotk * ux + rfdotk * vx) * ER_MIN_TO_KM_S,
      y: (rdotk * uy + rfdotk * vy) * ER_MIN_TO_KM_S,
      z: (rdotk * uz + rfdotk * vz) * ER_MIN_TO_KM_S,
    },
  };
}

export interface GeoFix {
  lat: number;
  lon: number;
  altKm: number;
}

/** ECI (km) + Julian date → WGS-84 sub-point. Pure. */
export function eciToGeo(r: Vec3, jd: number): GeoFix {
  const e2 = WGS_F * (2 - WGS_F);
  const theta = gmst(jd);
  const p = Math.hypot(r.x, r.y);
  const lon = ((((Math.atan2(r.y, r.x) - theta + Math.PI) % TWOPI) + TWOPI) % TWOPI) - Math.PI;
  const rMod = Math.hypot(p, r.z);
  let lat = Math.asin(Math.max(-1, Math.min(1, rMod > 0 ? r.z / rMod : 0)));
  let alt = rMod - WGS_A;
  for (let i = 0; i < 4; i++) {
    const s = Math.sin(lat);
    const n = WGS_A / Math.sqrt(1 - e2 * s * s);
    alt = p / Math.max(1e-9, Math.cos(lat)) - n;
    lat = Math.atan2(r.z, p * (1 - (e2 * n) / (n + alt)));
  }
  return { lat: lat / DEG, lon: lon / DEG, altKm: alt };
}

/** Low-precision Sun direction (ECI unit vector). Good to ~0.01 deg. */
export function sunDirectionECI(jd: number): Vec3 {
  const n = jd - 2451545.0;
  const L = (((280.46 + 0.9856474 * n) % 360) + 360) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) + 360) % 360;
  const lambda = (L + 1.915 * Math.sin(g * DEG) + 0.02 * Math.sin(2 * g * DEG)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  return norm({ x: Math.cos(lambda), y: Math.cos(eps) * Math.sin(lambda), z: Math.sin(eps) * Math.sin(lambda) });
}

/** Subsolar ground point (drives the intro Earth terminator). */
export function subsolarPoint(jd: number): GeoFix {
  const s = sunDirectionECI(jd);
  const g = eciToGeo({ x: s.x * WGS_A, y: s.y * WGS_A, z: s.z * WGS_A }, jd);
  return { lat: g.lat, lon: g.lon, altKm: 0 };
}

export interface Boresight {
  ra: number;
  dec: number;
  approx: true;
}

/**
 * Approximate SPHEREx boresight: along-track unit (orbit-plane, ⊥ radial),
 * sweeping once per orbit. Real pointing steps a great-circle scan ~⊥ Sun —
 * this proxy is honest only as a moving HUD number, always label (approx).
 */
export function approxBoresight(r: Vec3, v: Vec3): Boresight {
  const h = norm(cross(r, v));
  const b = norm(cross(h, r));
  return {
    ra: (((Math.atan2(b.y, b.x) / DEG) % 360) + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, b.z))) / DEG,
    approx: true,
  };
}

export interface Telemetry {
  name: string;
  hero: boolean;
  lat: number;
  lon: number;
  altKm: number;
  velKmS: number;
  incDeg: number;
  mjd: number;
  tleAgeDays: number;
  boresight: Boresight | null;
}

/** Orthographic camera: sub-point the lens stares at. Unit-disc output. */
export interface OrthoView {
  latC: number;
  lonC: number;
}

export interface OrthoPoint {
  /** disc radii right / up from center */
  x: number;
  y: number;
  /** earth radii toward the camera */
  depth: number;
  visible: boolean;
}

function unitGeo(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
}

function orthoBasis(view: OrthoView): { xA: Vec3; yA: Vec3; c: Vec3 } {
  const c = unitGeo(view.latC, view.lonC);
  let xA = cross({ x: 0, y: 0, z: 1 }, c);
  xA = Math.hypot(xA.x, xA.y, xA.z) < 1e-6 ? { x: 1, y: 0, z: 0 } : norm(xA);
  return { xA, yA: norm(cross(c, xA)), c };
}

/**
 * Orthographic projection for the intro backdrop. The SAME function drives
 * canvas drawing and pointer hit-testing (canvas-sky-engine parity rule).
 * Screen: px = cx + x * R, py = cy - y * R.
 */
export function orthoProject(lat: number, lon: number, altKm: number, view: OrthoView): OrthoPoint {
  const { xA, yA, c } = orthoBasis(view);
  const k = (RE_KM + altKm) / RE_KM;
  const p = unitGeo(lat, lon);
  const q = { x: p.x * k, y: p.y * k, z: p.z * k };
  const x = dot(q, xA);
  const y = dot(q, yA);
  const depth = dot(q, c);
  const limb = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return { x, y, depth, visible: depth > limb - 1e-6 };
}

/** Sun direction in screen space: axis toward the Sun + behind/in-front depth. */
export function sunScreenAxis(jd: number, view: OrthoView): { ax: number; ay: number; depth: number } {
  const { xA, yA, c } = orthoBasis(view);
  const s = sunDirectionECI(jd);
  const ax = dot(s, xA);
  const ay = dot(s, yA);
  const m = Math.hypot(ax, ay) || 1;
  return { ax: ax / m, ay: ay / m, depth: dot(s, c) };
}

/** One prepared swarm entry: parsed record + display name. Null when unusable. */
export interface PreparedSat {
  obj: SwarmObject;
  sat: SatRec;
}

export function prepareSwarm(bundle: SwarmBundle): PreparedSat[] {
  const out: PreparedSat[] = [];
  for (const obj of bundle.objects) {
    const sat = parseTLE(obj.l1, obj.l2);
    if (sat && !isDeepSpace(sat)) out.push({ obj, sat });
  }
  return out;
}

/** Live HUD numbers for one satellite. Null when propagation refuses. */
export function telemetryFor(entry: PreparedSat, at?: Date, ageAt?: Date): Telemetry | null {
  const jd = nowJD(at);
  const p = propagate(entry.sat, (jd - entry.sat.jdsatepoch) * 1440);
  if (!p.ok) return null;
  const geo = eciToGeo(p.r, jd);
  return {
    name: entry.obj.name,
    hero: entry.obj.hero ?? false,
    lat: geo.lat,
    lon: geo.lon,
    altKm: geo.altKm,
    velKmS: Math.hypot(p.v.x, p.v.y, p.v.z),
    incDeg: entry.sat.inclo / DEG,
    mjd: mjdFromJD(jd),
    tleAgeDays: nowJD(ageAt) - entry.sat.jdsatepoch,
    boresight: approxBoresight(p.r, p.v),
  };
}

const BUNDLE_URL = '/data/tle-bundle.json';
const BUNDLE_KEY = 'sh-tle-swarm';
const BUNDLE_TTL = 24 * 3600 * 1000;

function bundleAge(): number {
  try {
    return Date.now() - Number(localStorage.getItem(`${BUNDLE_KEY}:at`) || 0);
  } catch {
    return Infinity;
  }
}

function readBundleCache(): SwarmBundle | null {
  try {
    const raw = localStorage.getItem(BUNDLE_KEY);
    return raw ? (JSON.parse(raw) as SwarmBundle) : null;
  } catch {
    return null;
  }
}

/**
 * Cache-first swarm bundle: device copy resolves instantly, refresh behind.
 * Falls back to the bundled static file, then the caller-supplied fallback.
 * Never throws, never hangs: the network leg races a timeout so a stalled
 * fetch (cold profile, slow disk, offline shell) can't wedge the intro on
 * "ACQUIRING SIGNAL" forever.
 */
export async function getSwarmBundle(fallback: SwarmBundle, timeoutMs = 8000): Promise<SwarmBundle> {
  const cached = readBundleCache();
  const refresh = (async (): Promise<SwarmBundle | null> => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
    try {
      const r = await fetch(BUNDLE_URL, ctrl ? { signal: ctrl.signal } : undefined);
      if (!r.ok) return null;
      const j = (await r.json()) as SwarmBundle;
      if (!j || !Array.isArray(j.objects)) return null;
      try {
        localStorage.setItem(BUNDLE_KEY, JSON.stringify(j));
        localStorage.setItem(`${BUNDLE_KEY}:at`, String(Date.now()));
      } catch {
        /* noop */
      }
      return j;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  if (cached && bundleAge() < BUNDLE_TTL) {
    void refresh;
    return cached;
  }
  if (cached) {
    void refresh;
    return cached;
  }
  return (await refresh) ?? fallback;
}
