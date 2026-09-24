// Point-at-sky posture: phone sensors -> viewing direction -> RA/Dec.
// Pure math lives here (unit-tested); the DOM event wiring lives in the hook
// in StellariumView. Portrait-first; landscape is best-effort with a manual
// calibration offset to absorb device-specific compass bias.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const normDeg = (d: number) => ((d % 360) + 360) % 360;

function lstDeg(date: Date, lon: number): number {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  return (((gmst + lon) % 360) + 360) % 360;
}

/**
 * Equatorial from horizontal. Inverse of altAz() in StellariumView
 * (azimuth from north, eastward; A = az-180 recovers south-westward angle).
 */
export function radecFromAltAz(
  altDeg: number, azDeg: number, latDeg: number, lonDeg: number, date: Date,
): { ra: number; dec: number } {
  const alt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, altDeg * D2R));
  const la = latDeg * D2R;
  const A = (azDeg - 180) * D2R;
  // A is south-based so cos(A) = -cos(azimuth-from-north): signs flip
  // relative to the north-based spherical law of cosines.
  const sinDec = Math.sin(alt) * Math.sin(la) - Math.cos(alt) * Math.cos(la) * Math.cos(A);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const cosDec = Math.max(1e-9, Math.cos(dec));
  const sinH = (Math.sin(A) * Math.cos(alt)) / cosDec;
  const cosH = (Math.sin(alt) - Math.sin(la) * Math.sin(dec)) / (Math.cos(la) * cosDec);
  const H = Math.atan2(sinH, cosH) * R2D;
  return { ra: normDeg(lstDeg(date, lonDeg) - H), dec: dec * R2D };
}

/** Shortest-path exponential smoothing for circular degrees. */
export function lerpAngle(prev: number, next: number, k: number): number {
  let d = (next - prev) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return normDeg(prev + d * k);
}

export interface RawOrientation {
  alpha: number | null; // z-rotation, compass-ish when absolute (Android)
  beta: number | null; // front-back tilt
  gamma: number | null; // left-right tilt
  absolute: boolean;
  webkitCompassHeading?: number | null; // iOS true heading
  webkitCompassAccuracy?: number | null; // iOS accuracy estimate (deg, -1 unknown)
  screenAngle: number; // screen.orientation.angle: 0/90/-90/180
}

export interface Pose {
  heading: number | null; // compass direction of view center (deg from N)
  elev: number | null; // elevation of view center (deg)
  headingAcc: number | null; // accuracy estimate when the platform reports one
}

/**
 * View direction from a deviceorientation snapshot. Returns nulls when the
 * platform gives us nothing usable (desktop, denied, non-absolute alpha).
 */
export function poseFromOrientation(o: RawOrientation): Pose {
  let heading: number | null = null;
  let headingAcc: number | null = null;
  if (o.webkitCompassHeading != null && o.webkitCompassHeading >= 0) {
    heading = normDeg(o.webkitCompassHeading);
    headingAcc = o.webkitCompassAccuracy != null && o.webkitCompassAccuracy >= 0
      ? o.webkitCompassAccuracy
      : null;
  } else if (o.absolute && o.alpha != null) {
    // Android: alpha runs opposite the compass; screen rotation shifts it.
    heading = normDeg(360 - o.alpha + o.screenAngle);
  }
  let elev: number | null = null;
  if (o.beta != null && o.gamma != null) {
    const tilt = o.screenAngle === 0 ? o.beta
      : o.screenAngle === 180 ? 180 - o.beta
      : o.screenAngle === 90 ? -o.gamma
      : o.gamma;
    elev = 90 - tilt;
    if (elev > 90) elev = 180 - elev;
    if (elev < -90) elev = -180 - elev;
    elev = Math.max(-90, Math.min(90, elev));
  }
  return { heading, elev, headingAcc };
}

export interface GeoFix { lat: number; lon: number }

/** View-center RA/Dec from a smoothed pose + site + clock (+ calibration). */
export function radecFromPose(
  pose: Pose, site: GeoFix, date: Date, calibDeg = 0,
): { ra: number; dec: number } | null {
  if (pose.heading == null || pose.elev == null) return null;
  return radecFromAltAz(pose.elev, normDeg(pose.heading + calibDeg), site.lat, site.lon, date);
}
