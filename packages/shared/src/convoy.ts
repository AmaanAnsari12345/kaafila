import type { GeoPoint } from "./geo.js";

export type { GeoPoint } from "./geo.js";

export type ConvoyRole = "owner" | "leader" | "sweeper" | "driver" | "navigator" | "family" | "viewer";

export type ConvoyStatus = "scheduled" | "boarding" | "active" | "paused" | "completed" | "cancelled";

export type ConvoyVisibility = "private" | "club" | "public" | "fleet" | "event";

export type VehicleType = "car" | "suv" | "supercar" | "motorcycle" | "bus" | "truck" | "ev" | "support";

export type FuelType = "petrol" | "diesel" | "cng" | "lpg" | "ev" | "hybrid";

export const CONVOY_ROLES: ConvoyRole[] = ["owner", "leader", "sweeper", "driver", "navigator", "family", "viewer"];

/** Roles allowed to issue convoy-wide commands (regroup, end, promote). */
export const COMMAND_ROLES: ConvoyRole[] = ["owner", "leader"];

/** Roles that can drive a vehicle in the convoy (and therefore send location). */
export const DRIVING_ROLES: ConvoyRole[] = ["owner", "leader", "sweeper", "driver", "navigator"];

export interface VehicleSnapshot {
  id: string;
  userId: string;
  convoyId: string;
  displayName: string;
  vehicleName: string;
  vehicleType: VehicleType;
  role: ConvoyRole;
  position: GeoPoint;
  speedKph: number;
  headingDeg: number;
  batteryPct?: number;
  fuelPct?: number;
  distanceFromLeadMeters: number;
  separationMeters: number;
  etaIso: string;
  lastSeenIso: string;
  health: "green" | "amber" | "red";
}

/** Live state of a vehicle as held in Redis and fanned out over sockets. */
export interface LiveVehicleState {
  vehicleId: string;
  userId: string;
  convoyId: string;
  displayName: string;
  vehicleName: string;
  vehicleType: VehicleType;
  role: ConvoyRole;
  position: GeoPoint;
  speedKph: number;
  headingDeg: number;
  accuracyMeters?: number;
  fuelPct?: number;
  batteryPct?: number;
  rangeKmFull?: number;
  fuelType?: FuelType;
  capturedAtIso: string;
  /** ISO time the vehicle last started moving after a stop of >= 10 min */
  drivingSinceIso?: string;
  plan: "explorer" | "drive" | "fleet";
}

export interface ConvoyRoom {
  id: string;
  name: string;
  status: ConvoyStatus;
  inviteCode: string;
  joinUrl: string;
  origin: GeoPoint;
  destination: GeoPoint;
  routePolyline?: string;
  leaderUserId: string;
  activeVehicles: number;
  maxVehicles: number;
  startedAtIso?: string;
  plannedDepartureIso?: string;
  regroup?: RegroupPoint | null;
}

export interface RegroupPoint {
  name: string;
  position: GeoPoint;
  setByUserId: string;
  setAtIso: string;
}

export interface ConvoyHealth {
  convoyId: string;
  healthScore: number;
  activeVehicles: number;
  missingVehicles: number;
  avgSeparationMeters: number;
  routeDeviationCount: number;
  sosCount: number;
  lastUpdatedIso: string;
}

export interface RoutePlan {
  provider: "osrm" | "google" | "estimate";
  distanceMeters: number;
  durationSeconds: number;
  /** precision-5 encoded polyline */
  polyline: string;
  /** true when the route is a straight-line estimate because no routing provider answered */
  isEstimate: boolean;
}
