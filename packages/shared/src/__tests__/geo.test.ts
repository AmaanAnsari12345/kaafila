import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteIndex,
  decodePolyline,
  destinationPoint,
  encodePolyline,
  geohashDecode,
  geohashEncode,
  geohashesAlongSegment,
  haversineMeters,
  pointAtChainage,
  projectOntoRoute
} from "../geo.js";

test("haversine: Mumbai to Pune is ~120 km straight line", () => {
  const d = haversineMeters({ lat: 19.076, lng: 72.8777 }, { lat: 18.5204, lng: 73.8567 });
  assert.ok(d > 115_000 && d < 125_000, `got ${d}`);
});

test("polyline: decodes Google's reference example", () => {
  // Reference from Google's Encoded Polyline Algorithm documentation.
  const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(
    pts.map((p) => [Number(p.lat.toFixed(3)), Number(p.lng.toFixed(3))]),
    [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453]
    ]
  );
});

test("polyline: encode/decode round trip", () => {
  const pts = [
    { lat: 19.07601, lng: 72.87765 },
    { lat: 18.95, lng: 73.1 },
    { lat: 15.29932, lng: 74.12399 }
  ];
  const back = decodePolyline(encodePolyline(pts));
  back.forEach((p, i) => {
    assert.ok(Math.abs(p.lat - pts[i]!.lat) < 1e-5);
    assert.ok(Math.abs(p.lng - pts[i]!.lng) < 1e-5);
  });
});

test("projection: point beside a straight route gets correct chainage and cross-track", () => {
  const a = { lat: 19.0, lng: 73.0 };
  const b = destinationPoint(a, 0, 10_000); // 10 km due north
  const route = buildRouteIndex([a, b]);
  const mid = destinationPoint(destinationPoint(a, 0, 4000), 90, 200); // 4 km along, 200 m east
  const proj = projectOntoRoute(route, mid);
  assert.ok(Math.abs(proj.chainageMeters - 4000) < 20, `chainage ${proj.chainageMeters}`);
  assert.ok(Math.abs(proj.crossTrackMeters - 200) < 5, `cross ${proj.crossTrackMeters}`);
});

test("pointAtChainage inverts projection on the route", () => {
  const a = { lat: 12.97, lng: 77.59 };
  const b = destinationPoint(a, 45, 5000);
  const c = destinationPoint(b, 120, 5000);
  const route = buildRouteIndex([a, b, c]);
  const p = pointAtChainage(route, 7500);
  const proj = projectOntoRoute(route, p);
  assert.ok(Math.abs(proj.chainageMeters - 7500) < 5);
  assert.ok(proj.crossTrackMeters < 2);
});

test("geohash: known value and decode within error", () => {
  // Wikipedia reference: (57.64911, 10.40744) -> u4pruydqqvj
  assert.equal(geohashEncode({ lat: 57.64911, lng: 10.40744 }, 11), "u4pruydqqvj");
  const d = geohashDecode("u4pruydqqvj");
  assert.ok(Math.abs(d.lat - 57.64911) <= d.latErr + 1e-9);
  assert.ok(Math.abs(d.lng - 10.40744) <= d.lngErr + 1e-9);
});

test("geohashesAlongSegment covers start and end cells", () => {
  const a = { lat: 18.5, lng: 73.8 };
  const b = destinationPoint(a, 90, 5000);
  const cells = geohashesAlongSegment(a, b, 6);
  assert.ok(cells.includes(geohashEncode(a, 6)));
  assert.ok(cells.includes(geohashEncode(b, 6)));
  assert.ok(cells.length >= 4);
});
