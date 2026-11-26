/**
 * Plans and pricing. KAAFILA Drive is priced per vehicle per month.
 * Entitlements are always evaluated server-side per vehicle.
 */

export type PlanCode = "explorer" | "drive" | "fleet";

export interface PlanLimits {
  /** minimum seconds between accepted location pings */
  pingIntervalSeconds: number;
  historyDays: number;
  assistant: boolean;
  journeyRecording: boolean;
  obdTelemetryHistory: boolean;
  intelligence: boolean;
  familyLinks: boolean;
  kitty: boolean;
  hdVoice: boolean;
  video: boolean;
  ads: boolean;
}

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  explorer: {
    pingIntervalSeconds: 10,
    historyDays: 7,
    assistant: false,
    journeyRecording: false,
    obdTelemetryHistory: false,
    intelligence: true,
    familyLinks: false,
    kitty: true,
    hdVoice: false,
    video: false,
    ads: true
  },
  drive: {
    pingIntervalSeconds: 2,
    historyDays: 365,
    assistant: true,
    journeyRecording: true,
    obdTelemetryHistory: true,
    intelligence: true,
    familyLinks: true,
    kitty: true,
    hdVoice: true,
    video: true,
    ads: false
  },
  fleet: {
    pingIntervalSeconds: 2,
    historyDays: 730,
    assistant: true,
    journeyRecording: true,
    obdTelemetryHistory: true,
    intelligence: true,
    familyLinks: true,
    kitty: true,
    hdVoice: true,
    video: true,
    ads: false
  }
};

/** Headline price: INR 500 per vehicle per month. */
export const DRIVE_PRICE_PER_VEHICLE_INR = 500;
export const DRIVE_PRICE_PER_VEHICLE_MINOR = DRIVE_PRICE_PER_VEHICLE_INR * 100;

/** GST on SaaS in India is 18% (unchanged by the September 2025 rate rationalisation). */
export const DEFAULT_GST_RATE = 0.18;

/**
 * RBI e-mandate framework: recurring debits above INR 15,000 per transaction need
 * additional factor authentication on every debit.
 */
export const RBI_EMANDATE_AFA_LIMIT_MINOR = 15_000 * 100;

export type TaxMode = "inclusive" | "exclusive";

export interface PriceQuote {
  plan: "drive";
  vehicles: number;
  currency: "INR";
  unitPriceMinor: number;
  taxMode: TaxMode;
  gstRate: number;
  /** amount before tax */
  subtotalMinor: number;
  gstMinor: number;
  /** amount charged each month */
  totalMinor: number;
  /** true when each monthly debit exceeds the RBI no-OTP limit */
  exceedsEmandateLimit: boolean;
  /** largest number of vehicles that fits under the RBI limit in one subscription */
  maxVehiclesPerMandate: number;
}

export function quoteDrive(vehicles: number, taxMode: TaxMode = "inclusive", gstRate = DEFAULT_GST_RATE, unitPriceMinor = DRIVE_PRICE_PER_VEHICLE_MINOR): PriceQuote {
  if (!Number.isInteger(vehicles) || vehicles < 1) throw new Error("vehicles must be a positive integer");
  const gross = unitPriceMinor * vehicles;
  let subtotal: number;
  let gst: number;
  let total: number;

  if (taxMode === "inclusive") {
    total = gross;
    subtotal = Math.round(gross / (1 + gstRate));
    gst = total - subtotal;
  } else {
    subtotal = gross;
    gst = Math.round(gross * gstRate);
    total = subtotal + gst;
  }

  const perVehicleCharged = taxMode === "inclusive" ? unitPriceMinor : Math.round(unitPriceMinor * (1 + gstRate));

  return {
    plan: "drive",
    vehicles,
    currency: "INR",
    unitPriceMinor,
    taxMode,
    gstRate,
    subtotalMinor: subtotal,
    gstMinor: gst,
    totalMinor: total,
    exceedsEmandateLimit: total > RBI_EMANDATE_AFA_LIMIT_MINOR,
    maxVehiclesPerMandate: Math.floor(RBI_EMANDATE_AFA_LIMIT_MINOR / perVehicleCharged)
  };
}

export interface PlanCard {
  code: PlanCode;
  name: string;
  priceLabel: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
}

export const PLAN_CARDS: PlanCard[] = [
  {
    code: "explorer",
    name: "Explorer",
    priceLabel: "Free",
    cadence: "forever",
    tagline: "Join convoys and try the essentials.",
    features: [
      "Join any convoy as a car",
      "Live map, quick signals, chat",
      "SOS, roadside guides, emergency numbers",
      "Kitty expense splitting",
      "Location updates every 10 s, 7-day history"
    ],
    cta: "Start free"
  },
  {
    code: "drive",
    name: "Drive",
    priceLabel: `₹${DRIVE_PRICE_PER_VEHICLE_INR}`,
    cadence: "per car / month",
    tagline: "Everything KAAFILA does, for every car that rolls with you.",
    features: [
      "Elastic Band, Weakest-Link Range, Fair Regroup",
      "Dead-Zone Forecast and Convoy Pulse fatigue alerts",
      "AI co-pilot with live convoy context",
      "Journey recording, replay and reports",
      "OBD-II diagnostics and garage reminders",
      "Family follow links, HD voice, 2 s updates, 365-day history",
      "No ads"
    ],
    cta: "Get Drive"
  },
  {
    code: "fleet",
    name: "Fleet & Events",
    priceLabel: "Custom",
    cadence: "quote",
    tagline: "Tour operators, wedding fleets and corporate convoys.",
    features: ["All Drive features", "Bulk onboarding and seat management", "GST invoicing", "Priority support and SLA"],
    cta: "Talk to us"
  }
];
