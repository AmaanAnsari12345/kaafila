import type { GeoPoint } from "./geo.js";

export type JourneyEventType =
  | "trip_started"
  | "trip_completed"
  | "location"
  | "stop"
  | "photo"
  | "video"
  | "voice_note"
  | "toll"
  | "checkpoint"
  | "hazard"
  | "sos";

export interface JourneyEvent {
  id: string;
  journeyId: string;
  type: JourneyEventType;
  title: string;
  location?: GeoPoint;
  metadata: Record<string, unknown>;
  capturedAtIso: string;
}

export interface JourneyStats {
  distanceKm: number;
  movingTimeMinutes: number;
  stoppedTimeMinutes: number;
  averageSpeedKph: number;
  maxSpeedKph: number;
  tollsPaidMinor: number;
  checkpoints: number;
  mediaItems: number;
}

export interface JourneyReplayFrame {
  ts: string;
  vehicleId: string;
  location: GeoPoint;
  speedKph: number;
  headingDeg: number;
}
