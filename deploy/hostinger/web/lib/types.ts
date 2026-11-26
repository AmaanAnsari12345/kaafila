import type { ConvoyRole, ConvoyStatus, FuelType, RegroupPoint, VehicleType } from "@kaafila/shared";

export interface ConvoySummary {
  id: string;
  name: string;
  status: ConvoyStatus;
  inviteCode: string;
  joinUrl: string;
  role: ConvoyRole;
  vehicleId: string | null;
  originName: string | null;
  destinationName: string | null;
  plannedDepartureAt: string | null;
  startedAt: string | null;
  routeDistanceM: number | null;
  _count: { members: number };
}

export interface ConvoyMemberDetail {
  id: string;
  userId: string;
  vehicleId: string | null;
  role: ConvoyRole;
  status: string;
  plan: "explorer" | "drive" | "fleet";
  user: { id: string; displayName: string; avatarUrl: string | null; handle: string | null };
  vehicle: {
    id: string;
    name: string;
    type: VehicleType;
    make: string | null;
    model: string | null;
    color: string | null;
    fuelType: FuelType | null;
    rangeKmFull: number | null;
    plateNumber: string | null;
  } | null;
}

export interface ConvoyDetail {
  id: string;
  name: string;
  status: ConvoyStatus;
  inviteCode: string;
  joinUrl: string;
  ownerId: string;
  leaderUserId: string;
  originLat: number;
  originLng: number;
  originName: string | null;
  destinationLat: number;
  destinationLng: number;
  destinationName: string | null;
  routePolyline: string | null;
  routeDistanceM: number | null;
  routeDurationS: number | null;
  routeProvider: string | null;
  plannedDepartureAt: string | null;
  members: ConvoyMemberDetail[];
  voiceChannels: { id: string; name: string; channelType: string }[];
  regroup: RegroupPoint | null;
  me: { role: ConvoyRole; vehicleId: string | null; staffOverride: boolean };
}

export interface GarageVehicle {
  id: string;
  name: string;
  type: VehicleType;
  make: string | null;
  model: string | null;
  year: number | null;
  plateNumber: string | null;
  color: string | null;
  fuelType: FuelType | null;
  rangeKmFull: number | null;
  odometerKm: number | null;
  photoUrl: string | null;
  isShowcase: boolean;
  isDefault: boolean;
  plan: "explorer" | "drive" | "fleet";
  attention: number;
  reminders: { id: string; title: string; type: string; status: { state: "ok" | "due_soon" | "overdue"; label: string } }[];
  documents: { id: string; kind: string; number: string | null; expiresAt: string | null; status: { state: "ok" | "expiring" | "expired" | "unknown"; daysLeft: number | null } }[];
}

export interface KittySummary {
  currency: string;
  totalMinor: number;
  byCategory: Record<string, number>;
  expenses: { id: string; title: string; category: string; amountMinor: number; splitMode: string; paidById: string; paidByName: string; createdAtIso: string }[];
  balances: { userId: string; name: string; amountMinor: number }[];
  transfers: { fromUserId: string; toUserId: string; amountMinor: number; fromName: string; toName: string; upiLink: string | null }[];
  members: { userId: string; name: string; vehicleId: string | null; role: ConvoyRole }[];
}
