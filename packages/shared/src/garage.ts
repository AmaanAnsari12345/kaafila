/** Car care: reminders, document expiry and pre-trip checklist. */

export type ReminderType =
  | "engine_oil"
  | "oil_filter"
  | "air_filter"
  | "cabin_filter"
  | "brake_pads"
  | "brake_fluid"
  | "coolant"
  | "tyre_rotation"
  | "wheel_alignment"
  | "battery"
  | "general_service"
  | "custom";

export type DocumentKind = "insurance" | "registration" | "pollution_cert" | "permit" | "fastag" | "driving_licence" | "fitness_cert" | "other";

export const DOCUMENT_KINDS: { id: DocumentKind; label: string }[] = [
  { id: "insurance", label: "Insurance" },
  { id: "registration", label: "Registration (RC)" },
  { id: "pollution_cert", label: "Pollution certificate (PUC)" },
  { id: "permit", label: "Permit" },
  { id: "fastag", label: "FASTag" },
  { id: "driving_licence", label: "Driving licence" },
  { id: "fitness_cert", label: "Fitness certificate" },
  { id: "other", label: "Other" }
];

export const REMINDER_TYPES: { id: ReminderType; label: string }[] = [
  { id: "general_service", label: "General service" },
  { id: "engine_oil", label: "Engine oil" },
  { id: "oil_filter", label: "Oil filter" },
  { id: "air_filter", label: "Air filter" },
  { id: "cabin_filter", label: "Cabin filter" },
  { id: "brake_pads", label: "Brake pads" },
  { id: "brake_fluid", label: "Brake fluid" },
  { id: "coolant", label: "Coolant" },
  { id: "tyre_rotation", label: "Tyre rotation" },
  { id: "wheel_alignment", label: "Wheel alignment" },
  { id: "battery", label: "Battery check" },
  { id: "custom", label: "Custom" }
];

export interface ReminderInput {
  dueAtIso?: string | null;
  dueOdometerKm?: number | null;
}

export interface ReminderStatus {
  state: "ok" | "due_soon" | "overdue";
  daysLeft: number | null;
  kmLeft: number | null;
  label: string;
}

/** A reminder is due soon within 14 days or 500 km, whichever comes first. Intervals come from the owner's manual. */
export function reminderStatus(r: ReminderInput, currentOdometerKm: number | null | undefined, nowMs = Date.now()): ReminderStatus {
  const daysLeft = r.dueAtIso ? Math.floor((Date.parse(r.dueAtIso) - nowMs) / 86_400_000) : null;
  const kmLeft = typeof r.dueOdometerKm === "number" && typeof currentOdometerKm === "number" ? r.dueOdometerKm - currentOdometerKm : null;
  const overdue = (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0);
  const soon = (daysLeft !== null && daysLeft <= 14) || (kmLeft !== null && kmLeft <= 500);
  const parts: string[] = [];
  if (daysLeft !== null) parts.push(daysLeft < 0 ? `${-daysLeft} days overdue` : `in ${daysLeft} days`);
  if (kmLeft !== null) parts.push(kmLeft < 0 ? `${-kmLeft} km overdue` : `in ${kmLeft} km`);
  return { state: overdue ? "overdue" : soon ? "due_soon" : "ok", daysLeft, kmLeft, label: parts.join(" · ") || "No due date set" };
}

/** After a service is logged, roll the reminder forward by its interval. */
export function rollReminder(
  intervalDays: number | null | undefined,
  intervalKm: number | null | undefined,
  doneAtIso: string,
  doneOdometerKm: number | null | undefined
): { dueAtIso: string | null; dueOdometerKm: number | null } {
  return {
    dueAtIso: intervalDays ? new Date(Date.parse(doneAtIso) + intervalDays * 86_400_000).toISOString() : null,
    dueOdometerKm: intervalKm && typeof doneOdometerKm === "number" ? doneOdometerKm + intervalKm : null
  };
}

export function documentStatus(expiresAtIso: string | null | undefined, nowMs = Date.now()): { state: "ok" | "expiring" | "expired" | "unknown"; daysLeft: number | null } {
  if (!expiresAtIso) return { state: "unknown", daysLeft: null };
  const daysLeft = Math.floor((Date.parse(expiresAtIso) - nowMs) / 86_400_000);
  return { state: daysLeft < 0 ? "expired" : daysLeft <= 30 ? "expiring" : "ok", daysLeft };
}

export interface ChecklistItem {
  id: string;
  group: "Tyres" | "Fluids" | "Lights" | "Safety kit" | "Documents" | "Comfort";
  label: string;
}

export const PRE_TRIP_CHECKLIST: ChecklistItem[] = [
  { id: "tyre_pressure", group: "Tyres", label: "Tyre pressure set to the door-jamb placard (cold), including the spare" },
  { id: "tyre_tread", group: "Tyres", label: "Tread depth and sidewalls — no cuts or bulges" },
  { id: "engine_oil", group: "Fluids", label: "Engine oil between min and max" },
  { id: "coolant", group: "Fluids", label: "Coolant at the reservoir mark (check cold)" },
  { id: "brake_fluid", group: "Fluids", label: "Brake fluid level" },
  { id: "washer", group: "Fluids", label: "Windscreen washer topped up, wipers clean" },
  { id: "lights", group: "Lights", label: "Headlights, brake lights, indicators, hazards" },
  { id: "jack", group: "Safety kit", label: "Jack, wheel spanner and locking-nut key" },
  { id: "triangle", group: "Safety kit", label: "Warning triangle and reflective vest" },
  { id: "first_aid", group: "Safety kit", label: "First-aid kit and torch" },
  { id: "jump_leads", group: "Safety kit", label: "Jump leads or a jump starter" },
  { id: "docs", group: "Documents", label: "Licence, registration, insurance, PUC valid" },
  { id: "fastag", group: "Documents", label: "FASTag / toll balance topped up" },
  { id: "water", group: "Comfort", label: "Drinking water and snacks" },
  { id: "charger", group: "Comfort", label: "Phone mount and charger for the cockpit device" }
];
