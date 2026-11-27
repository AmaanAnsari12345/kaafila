/**
 * Feature registry: every user-facing capability that is rolled out gradually.
 * The database (FeatureFlag) overrides these defaults; admins change rollout from the console.
 * Evaluation is a stable hash of (key, userId) → bucket 0-99, enabled when bucket < rolloutPct.
 */

export type FeatureStage = "live" | "beta" | "planned";

export interface FeatureDef {
  key: string;
  name: string;
  description: string;
  stage: FeatureStage;
  defaultEnabled: boolean;
  defaultRolloutPct: number;
  /** quarter label for planned items; informational */
  target?: string;
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  { key: "voice_mode", name: "AI voice mode", description: "Hands-free spoken conversation with the KAAFILA co-pilot about your convoy, the app and roadside help.", stage: "beta", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "group_calls", name: "Group voice & video calls", description: "Convoy channels and club lounges on LiveKit, with push-to-talk for drivers.", stage: "beta", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "fuel_log", name: "Fuel log & real mileage", description: "Log fill-ups; KAAFILA computes real-world km/l (or km/kWh) and cost per km.", stage: "live", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "build_sheet", name: "Build sheet", description: "List your car's modifications and parts on your public garage showcase.", stage: "live", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "drive_score", name: "Smooth-driving score", description: "A score from harsh braking and acceleration in your journey, to drive smoother and safer.", stage: "beta", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "scenic_routes", name: "Scenic routes library", description: "Save the roads you loved, rate them and start a convoy on a route the community recommends.", stage: "beta", defaultEnabled: true, defaultRolloutPct: 100 },
  { key: "trek_mode", name: "KAAFILA Trek", description: "Walking and trekking groups: on-foot formation, altitude, water and daylight planning, last-light alerts.", stage: "planned", defaultEnabled: false, defaultRolloutPct: 0, target: "2027 Q2" },
  { key: "tour_mode", name: "KAAFILA Tour", description: "Tourist groups with a guide: meeting points, headcounts, itinerary and translated announcements.", stage: "planned", defaultEnabled: false, defaultRolloutPct: 0, target: "2027 Q3" },
  { key: "native_apps", name: "Native iOS & Android apps", description: "Background GPS, CarPlay and Android Auto.", stage: "planned", defaultEnabled: false, defaultRolloutPct: 0, target: "2027 Q2" },
  { key: "marketplace", name: "Workshops & parts marketplace", description: "Book verified workshops and buy parts from inside your garage.", stage: "planned", defaultEnabled: false, defaultRolloutPct: 0, target: "2027 Q4" }
];

export type FeatureKey = (typeof FEATURE_REGISTRY)[number]["key"];

export function featureDef(key: string): FeatureDef | undefined {
  return FEATURE_REGISTRY.find((f) => f.key === key);
}

/** FNV-1a hash → stable 0-99 bucket per (key, subject). Works in browsers and Node without crypto. */
export function rolloutBucket(key: string, subjectId: string): number {
  let h = 0x811c9dc5;
  const s = `${key}:${subjectId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export function isFeatureOn(enabled: boolean, rolloutPct: number, key: string, subjectId: string): boolean {
  return enabled && rolloutBucket(key, subjectId) < Math.max(0, Math.min(100, rolloutPct));
}
