export interface GeoPoint {
  lat: number;
  lng: number;
}

export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees [0, 360). */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached travelling `distanceM` from `origin` on `bearing` (degrees). */
export function destinationPoint(origin: GeoPoint, bearing: number, distanceM: number): GeoPoint {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearing);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta));
  const lng2 =
    lng1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(lat1), Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/** Linear interpolation between two points (fine for segments of a few km). */
export function interpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/* ------------------------------------------------------------------ */
/* Encoded polyline (Google algorithm). Precision 5 = Google/OSRM,     */
/* precision 6 = Valhalla / OSRM with geometries=polyline6.           */
/* ------------------------------------------------------------------ */

export function decodePolyline(encoded: string, precision = 5): GeoPoint[] {
  const factor = 10 ** precision;
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

export function encodePolyline(points: GeoPoint[], precision = 5): string {
  const factor = 10 ** precision;
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    chunk += String.fromCharCode(v + 63);
    return chunk;
  };

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    output += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

/* ------------------------------------------------------------------ */
/* Route projection: distance along route (chainage) + cross-track.   */
/* Uses a local equirectangular projection per segment, accurate to   */
/* well under 1% for segments shorter than ~50 km.                    */
/* ------------------------------------------------------------------ */

export interface RouteIndex {
  points: GeoPoint[];
  /** cumulative distance in metres at each vertex */
  cumulative: number[];
  totalMeters: number;
}

export function buildRouteIndex(points: GeoPoint[]): RouteIndex {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineMeters(points[i - 1]!, points[i]!));
  }
  return { points, cumulative, totalMeters: cumulative[cumulative.length - 1] ?? 0 };
}

export interface RouteProjection {
  /** metres from route start to the projected point */
  chainageMeters: number;
  /** perpendicular distance from the route in metres */
  crossTrackMeters: number;
  /** projected point on the route */
  snapped: GeoPoint;
  segmentIndex: number;
}

export function projectOntoRoute(route: RouteIndex, p: GeoPoint): RouteProjection {
  if (route.points.length === 0) {
    return { chainageMeters: 0, crossTrackMeters: 0, snapped: p, segmentIndex: 0 };
  }
  if (route.points.length === 1) {
    return {
      chainageMeters: 0,
      crossTrackMeters: haversineMeters(route.points[0]!, p),
      snapped: route.points[0]!,
      segmentIndex: 0
    };
  }

  let best: RouteProjection | null = null;
  const mPerDegLat = 111_320;

  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i]!;
    const b = route.points[i + 1]!;
    const mPerDegLng = 111_320 * Math.cos(toRad((a.lat + b.lat) / 2));
    const bx = (b.lng - a.lng) * mPerDegLng;
    const by = (b.lat - a.lat) * mPerDegLat;
    const px = (p.lng - a.lng) * mPerDegLng;
    const py = (p.lat - a.lat) * mPerDegLat;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const snapped = interpolate(a, b, t);
    const cross = haversineMeters(snapped, p);

    if (!best || cross < best.crossTrackMeters) {
      const segLen = route.cumulative[i + 1]! - route.cumulative[i]!;
      best = {
        chainageMeters: route.cumulative[i]! + segLen * t,
        crossTrackMeters: cross,
        snapped,
        segmentIndex: i
      };
    }
  }

  return best!;
}

/** Point at a given chainage along the route. */
export function pointAtChainage(route: RouteIndex, chainage: number): GeoPoint {
  const { points, cumulative } = route;
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (chainage <= 0) return points[0]!;
  if (chainage >= route.totalMeters) return points[points.length - 1]!;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= chainage) lo = mid;
    else hi = mid;
  }
  const seg = cumulative[hi]! - cumulative[lo]!;
  const t = seg === 0 ? 0 : (chainage - cumulative[lo]!) / seg;
  return interpolate(points[lo]!, points[hi]!, t);
}

/* ------------------------------------------------------------------ */
/* Geohash                                                            */
/* ------------------------------------------------------------------ */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohashEncode(p: GeoPoint, precision = 6): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (p.lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch <<= 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (p.lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch <<= 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export function geohashDecode(hash: string): GeoPoint & { latErr: number; lngErr: number } {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let even = true;

  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new Error(`Invalid geohash character "${c}"`);
    for (let mask = 16; mask >= 1; mask >>= 1) {
      const on = (idx & mask) !== 0;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (on) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    latErr: (latMax - latMin) / 2,
    lngErr: (lngMax - lngMin) / 2
  };
}

/** Geohash cells (at `precision`) crossed by the straight segment a→b, sampled every `stepM`. */
export function geohashesAlongSegment(a: GeoPoint, b: GeoPoint, precision = 6, stepM = 400): string[] {
  const dist = haversineMeters(a, b);
  const steps = Math.max(1, Math.ceil(dist / stepM));
  const cells = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    cells.add(geohashEncode(interpolate(a, b, i / steps), precision));
  }
  return [...cells];
}

export function boundingBox(points: GeoPoint[]) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLat = Math.max(maxLat, p.lat);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 10_000) return `${Math.round(meters / 1000)} km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
