import type { GeoPoint } from "./geo.js";
import type { LiveVehicleState, RegroupPoint, VehicleSnapshot } from "./convoy.js";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertType =
  | "vehicle_separation"
  | "lost_vehicle"
  | "route_deviation"
  | "speed_camera"
  | "checkpoint"
  | "road_hazard"
  | "toll"
  | "pit_stop"
  | "sos"
  | "fatigue"
  | "low_range"
  | "dead_zone"
  | "regroup";

export interface ConvoyAlert {
  id: string;
  convoyId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  location?: GeoPoint;
  vehicleId?: string;
  createdAtIso: string;
  acknowledgedAtIso?: string;
}

export interface LocationPingPayload {
  convoyId: string;
  vehicleId: string;
  position: GeoPoint;
  speedKph: number;
  headingDeg: number;
  accuracyMeters?: number;
  fuelPct?: number;
  batteryPct?: number;
  capturedAtIso: string;
}

export interface ConvoyStatePayload {
  convoyId: string;
  vehicles: VehicleSnapshot[];
  alerts: ConvoyAlert[];
}

export interface VoiceSignalPayload {
  convoyId: string;
  channelId: string;
  userId: string;
  kind: "ptt_start" | "ptt_stop" | "speaking" | "muted" | "signal";
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Quick signals: one-tap, hands-free messages for moving drivers.    */
/* ------------------------------------------------------------------ */

export type QuickSignalCode =
  | "need_fuel"
  | "need_charge"
  | "washroom"
  | "food_break"
  | "slow_down"
  | "speed_up"
  | "pull_over"
  | "all_ok"
  | "flat_tyre"
  | "breakdown"
  | "police_ahead"
  | "hazard_ahead"
  | "lost"
  | "wait_for_me";

export interface QuickSignalDef {
  code: QuickSignalCode;
  label: string;
  spoken: string;
  severity: AlertSeverity;
}

export const QUICK_SIGNALS: QuickSignalDef[] = [
  { code: "need_fuel", label: "Need fuel", spoken: "needs fuel soon", severity: "warning" },
  { code: "need_charge", label: "Need charge", spoken: "needs to charge soon", severity: "warning" },
  { code: "washroom", label: "Washroom", spoken: "requests a washroom break", severity: "info" },
  { code: "food_break", label: "Food break", spoken: "suggests a food break", severity: "info" },
  { code: "slow_down", label: "Slow down", spoken: "asks the convoy to slow down", severity: "warning" },
  { code: "speed_up", label: "Pick up pace", spoken: "suggests picking up the pace", severity: "info" },
  { code: "pull_over", label: "Pull over", spoken: "is pulling over", severity: "warning" },
  { code: "all_ok", label: "All OK", spoken: "is OK", severity: "info" },
  { code: "flat_tyre", label: "Flat tyre", spoken: "has a flat tyre", severity: "critical" },
  { code: "breakdown", label: "Breakdown", spoken: "has broken down", severity: "critical" },
  { code: "police_ahead", label: "Police check", spoken: "reports a police check ahead", severity: "info" },
  { code: "hazard_ahead", label: "Hazard ahead", spoken: "reports a hazard ahead", severity: "warning" },
  { code: "lost", label: "I'm lost", spoken: "has lost the convoy", severity: "warning" },
  { code: "wait_for_me", label: "Wait for me", spoken: "asks the convoy to wait", severity: "warning" }
];

export function quickSignal(code: QuickSignalCode): QuickSignalDef {
  const def = QUICK_SIGNALS.find((s) => s.code === code);
  if (!def) throw new Error(`Unknown quick signal ${code}`);
  return def;
}

export interface QuickSignalEvent {
  id: string;
  convoyId: string;
  userId: string;
  vehicleId?: string;
  displayName: string;
  code: QuickSignalCode;
  position?: GeoPoint;
  createdAtIso: string;
}

export interface ChatMessageEvent {
  id: string;
  convoyId: string;
  userId: string;
  displayName: string;
  body: string;
  createdAtIso: string;
}

export interface SosEvent {
  id: string;
  convoyId?: string;
  userId: string;
  displayName: string;
  vehicleId?: string;
  kind: "manual" | "crash_detected" | "medical" | "breakdown" | "security";
  status: "open" | "acknowledged" | "resolved" | "false_alarm";
  position: GeoPoint;
  createdAtIso: string;
  medical?: { bloodGroup?: string; notes?: string; emergencyContactName?: string; emergencyContactPhone?: string };
}

/** Socket.IO event names shared by client and server. */
export const SOCKET_EVENTS = {
  join: "convoy:join",
  joined: "convoy:joined",
  leave: "convoy:leave",
  state: "convoy:state",
  presence: "convoy:presence",
  locationPing: "location:ping",
  locationUpdate: "location:update",
  signal: "signal:send",
  signalNew: "signal:new",
  chat: "chat:send",
  chatNew: "chat:new",
  voice: "voice:signal",
  sos: "sos:raise",
  sosNew: "sos:new",
  sosUpdate: "sos:update",
  alertNew: "alert:new",
  regroup: "regroup:set",
  regroupNew: "regroup:new",
  error: "convoy:error"
} as const;

export interface ConvoyStateSnapshot {
  convoyId: string;
  vehicles: LiveVehicleState[];
  regroup: RegroupPoint | null;
  serverTimeIso: string;
}
