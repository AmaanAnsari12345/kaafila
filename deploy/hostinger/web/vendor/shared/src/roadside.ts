/**
 * Roadside assistance data: emergency numbers, offline breakdown guides, POI categories.
 * Emergency numbers are a curated subset; the UI always tells users to verify locally.
 */

export interface EmergencyNumber {
  label: string;
  number: string;
  note?: string;
}

export interface CountryEmergency {
  countryCode: string;
  country: string;
  numbers: EmergencyNumber[];
}

const EU_112 = (countryCode: string, country: string): CountryEmergency => ({
  countryCode,
  country,
  numbers: [{ label: "Emergency (police, fire, ambulance)", number: "112" }]
});

export const EMERGENCY_NUMBERS: CountryEmergency[] = [
  {
    countryCode: "IN",
    country: "India",
    numbers: [
      { label: "National emergency (ERSS)", number: "112", note: "Police, fire and medical through one number" },
      { label: "Ambulance", number: "108", note: "State ambulance service in most states" },
      { label: "NHAI highway helpline", number: "1033", note: "National highways: breakdowns, accidents, cranes, ambulance" }
    ]
  },
  { countryCode: "US", country: "United States", numbers: [{ label: "Emergency", number: "911" }] },
  { countryCode: "CA", country: "Canada", numbers: [{ label: "Emergency", number: "911" }] },
  { countryCode: "MX", country: "Mexico", numbers: [{ label: "Emergency", number: "911" }] },
  {
    countryCode: "GB",
    country: "United Kingdom",
    numbers: [
      { label: "Emergency", number: "999" },
      { label: "Emergency (alternative)", number: "112" }
    ]
  },
  {
    countryCode: "IE",
    country: "Ireland",
    numbers: [
      { label: "Emergency", number: "112" },
      { label: "Emergency (alternative)", number: "999" }
    ]
  },
  EU_112("DE", "Germany"),
  EU_112("FR", "France"),
  EU_112("ES", "Spain"),
  EU_112("IT", "Italy"),
  EU_112("NL", "Netherlands"),
  EU_112("BE", "Belgium"),
  EU_112("AT", "Austria"),
  EU_112("PT", "Portugal"),
  EU_112("SE", "Sweden"),
  EU_112("FI", "Finland"),
  EU_112("DK", "Denmark"),
  EU_112("PL", "Poland"),
  EU_112("CZ", "Czechia"),
  EU_112("GR", "Greece"),
  EU_112("CH", "Switzerland"),
  {
    countryCode: "AU",
    country: "Australia",
    numbers: [
      { label: "Emergency", number: "000" },
      { label: "From mobile phones", number: "112" }
    ]
  },
  { countryCode: "NZ", country: "New Zealand", numbers: [{ label: "Emergency", number: "111" }] },
  {
    countryCode: "AE",
    country: "United Arab Emirates",
    numbers: [
      { label: "Police", number: "999" },
      { label: "Ambulance", number: "998" },
      { label: "Fire", number: "997" }
    ]
  },
  {
    countryCode: "SG",
    country: "Singapore",
    numbers: [
      { label: "Police", number: "999" },
      { label: "Ambulance and fire", number: "995" }
    ]
  },
  {
    countryCode: "JP",
    country: "Japan",
    numbers: [
      { label: "Police", number: "110" },
      { label: "Fire and ambulance", number: "119" }
    ]
  },
  {
    countryCode: "ZA",
    country: "South Africa",
    numbers: [
      { label: "Police", number: "10111" },
      { label: "Ambulance", number: "10177" },
      { label: "From mobile phones", number: "112" }
    ]
  },
  {
    countryCode: "LK",
    country: "Sri Lanka",
    numbers: [
      { label: "Police", number: "119" },
      { label: "Ambulance (Suwa Seriya)", number: "1990" }
    ]
  },
  { countryCode: "BD", country: "Bangladesh", numbers: [{ label: "National emergency", number: "999" }] },
  {
    countryCode: "NP",
    country: "Nepal",
    numbers: [
      { label: "Police", number: "100" },
      { label: "Ambulance", number: "102" },
      { label: "Fire", number: "101" }
    ]
  },
  {
    countryCode: "PK",
    country: "Pakistan",
    numbers: [
      { label: "Police", number: "15" },
      { label: "Rescue", number: "1122", note: "Provincial rescue service" }
    ]
  }
];

export const EMERGENCY_FALLBACK: CountryEmergency = {
  countryCode: "ZZ",
  country: "Unknown location",
  numbers: [{ label: "Emergency on most mobile networks", number: "112", note: "Works on many GSM networks worldwide. Verify the local number." }]
};

export function emergencyNumbersFor(countryCode?: string | null): CountryEmergency {
  if (!countryCode) return EMERGENCY_FALLBACK;
  return EMERGENCY_NUMBERS.find((c) => c.countryCode === countryCode.toUpperCase()) ?? EMERGENCY_FALLBACK;
}

/* ------------------------------------------------------------------ */
/* Offline breakdown guides                                           */
/* ------------------------------------------------------------------ */

export type GuideId =
  | "accident_scene"
  | "flat_tyre"
  | "overheating"
  | "dead_battery"
  | "brake_trouble"
  | "vehicle_fire"
  | "flooded_road"
  | "low_fuel"
  | "ev_low_charge"
  | "highway_breakdown"
  | "lost_from_convoy";

export interface RoadsideGuide {
  id: GuideId;
  title: string;
  urgency: "critical" | "high" | "normal";
  summary: string;
  steps: string[];
  doNot: string[];
}

export const ROADSIDE_GUIDES: RoadsideGuide[] = [
  {
    id: "accident_scene",
    title: "Accident scene",
    urgency: "critical",
    summary: "Make the scene safe, call for help, then help the injured without making things worse.",
    steps: [
      "Stop safely, switch on hazard lights and keep your own seat belt on until stopped.",
      "Check for danger: traffic, fire, fuel leaks. Keep bystanders off the carriageway.",
      "Call the emergency number (India: 112, highways: 1033). Give the location from the KAAFILA SOS screen.",
      "Place a warning triangle well behind the scene (on highways at least 50–100 m, or as local rules require).",
      "Raise a KAAFILA SOS so the leader and sweeper know where you are.",
      "If you are trained, give first aid: check breathing, control bleeding with firm pressure.",
      "Stay with the injured, keep them warm and talking until help arrives.",
      "India: people who help accident victims in good faith are legally protected as Good Samaritans (Motor Vehicles Act, Sec. 134A)."
    ],
    doNot: [
      "Do not move an injured person unless they are in immediate danger (fire, traffic).",
      "Do not remove a motorcyclist's helmet unless they are not breathing and you are trained.",
      "Do not give food or water to the injured."
    ]
  },
  {
    id: "flat_tyre",
    title: "Flat tyre",
    urgency: "high",
    summary: "Get off the road first; change the wheel only where it is safe.",
    steps: [
      "Signal, slow down gradually and pull fully off the road on firm, level ground. Avoid braking hard.",
      "Hazard lights on, parking brake on, put the car in gear (or P). Passengers out and away from traffic.",
      "Place the warning triangle behind the car. Send the 'Flat tyre' quick signal to the convoy.",
      "Loosen the wheel nuts half a turn while the wheel is on the ground.",
      "Jack the car at the jacking point shown in the owner's manual until the tyre clears the ground.",
      "Remove the nuts and wheel, fit the spare, hand-tighten the nuts in a star pattern.",
      "Lower the car and tighten the nuts fully in a star pattern. Check spare pressure.",
      "Space-saver spares have a speed limit (often 80 km/h). Tell the leader so the convoy adjusts."
    ],
    doNot: ["Do not get under a car supported only by a jack.", "Do not change a tyre on the traffic side of a busy highway — call 1033 or roadside assistance."]
  },
  {
    id: "overheating",
    title: "Engine overheating",
    urgency: "high",
    summary: "Temperature gauge in the red or steam from the bonnet: stop and let it cool.",
    steps: [
      "Switch off the AC and turn the cabin heater to full hot with the fan high — it draws heat from the engine.",
      "Pull over safely as soon as possible and switch off the engine.",
      "Open the bonnet only after steam has stopped. Wait at least 30 minutes for the engine to cool.",
      "Check the coolant reservoir level once cool. Top up with coolant or clean water if low.",
      "Look for obvious leaks or a broken fan belt.",
      "Restart and watch the gauge. If it climbs again, do not continue — call for assistance."
    ],
    doNot: ["Never open the radiator cap on a hot engine: pressurised coolant can cause severe burns.", "Do not pour cold water onto a hot engine block."]
  },
  {
    id: "dead_battery",
    title: "Dead battery (jump-start)",
    urgency: "normal",
    summary: "Another convoy car can jump-start you with leads in a few minutes.",
    steps: [
      "Park the donor car close without the cars touching. Both engines off, ignition keys out.",
      "Red lead: dead battery positive (+) → donor battery positive (+).",
      "Black lead: donor battery negative (−) → bare unpainted metal on the dead car's engine block, away from the battery.",
      "Start the donor car and let it run for 2–3 minutes.",
      "Start the dead car. Once running, remove leads in reverse order: black from your car, black from donor, red, red.",
      "Drive for at least 20–30 minutes to recharge, or get the battery tested."
    ],
    doNot: ["Do not let the clamps touch each other.", "Do not jump-start a battery that is cracked, leaking or frozen.", "Check the owner's manual — some cars (especially hybrids/EVs) have dedicated jump points."]
  },
  {
    id: "brake_trouble",
    title: "Brakes feel soft or fade",
    urgency: "critical",
    summary: "Lose speed with gears and the parking brake, steer to safety.",
    steps: [
      "Hazard lights on and warn the convoy with the 'Pull over' signal.",
      "Pump the brake pedal firmly — this can restore some pressure.",
      "Shift down progressively to use engine braking (automatic: select a lower range / L).",
      "Apply the parking brake gradually; hard application can lock the rear wheels.",
      "Steer towards an escape lane, uphill gradient or open shoulder.",
      "On long descents, use lower gears early to avoid brake fade."
    ],
    doNot: ["Do not switch off the engine while moving — you lose power steering and brake assist.", "Do not continue driving after brake fade until the brakes are inspected."]
  },
  {
    id: "vehicle_fire",
    title: "Vehicle fire",
    urgency: "critical",
    summary: "Get everyone out and far away. Property is replaceable.",
    steps: [
      "Pull over, switch off the engine, get everyone out immediately.",
      "Move at least 30 m away, upwind, away from traffic.",
      "Call the emergency number and raise a KAAFILA SOS.",
      "Warn approaching traffic from a safe distance."
    ],
    doNot: ["Do not open the bonnet — oxygen feeds the fire.", "Do not go back for belongings.", "Do not approach an EV battery fire; it can reignite."]
  },
  {
    id: "flooded_road",
    title: "Flooded road",
    urgency: "high",
    summary: "If you don't know how deep it is, don't drive into it.",
    steps: [
      "Stop before the water and check depth — watch other vehicles or use a stick.",
      "If you must cross shallow water, drive slowly in first gear at a steady pace, keeping revs up.",
      "Let oncoming vehicles pass first to avoid bow waves.",
      "After crossing, test your brakes gently at low speed to dry them.",
      "Report the flooding as a road report so cars behind are warned."
    ],
    doNot: ["Do not enter fast-flowing water — a car can float in about 30 cm of moving water.", "Do not restart a stalled engine in water (risk of hydro-lock)."]
  },
  {
    id: "low_fuel",
    title: "Low fuel",
    urgency: "normal",
    summary: "Slow down and head for the nearest station the range planner shows.",
    steps: [
      "Send the 'Need fuel' signal — the convoy range planner recalculates the stop.",
      "Drive smoothly at a moderate, steady speed; switch off AC if needed.",
      "Open Roadside → Fuel to see stations near you.",
      "If you run out, pull fully off the road, hazards on, and ask the sweeper or call 1033 on Indian national highways."
    ],
    doNot: ["Do not carry fuel in unapproved containers inside the cabin."]
  },
  {
    id: "ev_low_charge",
    title: "EV low charge",
    urgency: "normal",
    summary: "Reduce consumption and route to a charger with buffer.",
    steps: [
      "Send the 'Need charge' signal so the convoy plans a charging stop.",
      "Reduce speed — consumption rises sharply above highway cruising speeds.",
      "Turn on eco mode, reduce climate control use.",
      "Open Roadside → EV charging; check connector type and whether the charger is operational."
    ],
    doNot: ["Do not count on a single charger without a backup option in range."]
  },
  {
    id: "highway_breakdown",
    title: "Breakdown on a highway",
    urgency: "high",
    summary: "Your safety outranks the car: get people away from traffic.",
    steps: [
      "Steer to the far left shoulder (right in left-hand-traffic countries), as far from traffic as possible.",
      "Hazard lights on; at night keep sidelights on.",
      "Everyone out on the side away from traffic, behind the barrier if there is one.",
      "Place the warning triangle only if it is safe to walk back.",
      "Send the 'Breakdown' signal and call highway assistance (India national highways: 1033)."
    ],
    doNot: ["Do not stand between the car and traffic.", "Do not attempt repairs on the traffic side."]
  },
  {
    id: "lost_from_convoy",
    title: "Lost from the convoy",
    urgency: "normal",
    summary: "Follow the Ghost Leader trail or head to the regroup point.",
    steps: [
      "Send the 'I'm lost' signal — the leader and sweeper see it immediately.",
      "Open the map: the dashed Ghost Leader trail shows the exact path the leader drove.",
      "If a regroup point is set, navigate there; it is chosen to be fair for everyone's ETA.",
      "If you have no signal, keep to the planned route; your position syncs when coverage returns."
    ],
    doNot: ["Do not speed to catch up — the convoy will wait at the regroup point."]
  }
];

export function guideById(id: string): RoadsideGuide | undefined {
  return ROADSIDE_GUIDES.find((g) => g.id === id);
}

/* ------------------------------------------------------------------ */
/* POI categories (OpenStreetMap tags, queried via Overpass)          */
/* ------------------------------------------------------------------ */

export type PoiCategory =
  | "fuel"
  | "ev_charging"
  | "hospital"
  | "pharmacy"
  | "police"
  | "mechanic"
  | "tyres"
  | "toilets"
  | "food"
  | "lodging"
  | "parking";

export interface PoiCategoryDef {
  id: PoiCategory;
  label: string;
  /** Overpass tag filters, each one OR-ed */
  filters: string[];
}

export const POI_CATEGORIES: PoiCategoryDef[] = [
  { id: "fuel", label: "Fuel", filters: ['["amenity"="fuel"]'] },
  { id: "ev_charging", label: "EV charging", filters: ['["amenity"="charging_station"]'] },
  { id: "hospital", label: "Hospital", filters: ['["amenity"="hospital"]', '["amenity"="clinic"]'] },
  { id: "pharmacy", label: "Pharmacy", filters: ['["amenity"="pharmacy"]'] },
  { id: "police", label: "Police", filters: ['["amenity"="police"]'] },
  { id: "mechanic", label: "Mechanic", filters: ['["shop"="car_repair"]'] },
  { id: "tyres", label: "Tyre shop", filters: ['["shop"="tyres"]'] },
  { id: "toilets", label: "Toilets", filters: ['["amenity"="toilets"]'] },
  { id: "food", label: "Food", filters: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="cafe"]'] },
  { id: "lodging", label: "Stay", filters: ['["tourism"="hotel"]', '["tourism"="motel"]', '["tourism"="guest_house"]'] },
  { id: "parking", label: "Parking", filters: ['["amenity"="parking"]'] }
];

export function overpassQuery(category: PoiCategory, lat: number, lng: number, radiusMeters: number, limit = 40): string {
  const def = POI_CATEGORIES.find((c) => c.id === category);
  if (!def) throw new Error(`Unknown POI category ${category}`);
  const r = Math.round(Math.min(Math.max(radiusMeters, 200), 25_000));
  const parts = def.filters.flatMap((f) => [`node${f}(around:${r},${lat},${lng});`, `way${f}(around:${r},${lat},${lng});`]);
  return `[out:json][timeout:20];(${parts.join("")});out center ${limit};`;
}

export interface Poi {
  id: string;
  category: PoiCategory;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  phone?: string;
  openingHours?: string;
  brand?: string;
  tags?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Community road reports                                             */
/* ------------------------------------------------------------------ */

export type RoadReportType =
  | "pothole"
  | "accident"
  | "police_check"
  | "flooding"
  | "roadwork"
  | "debris"
  | "animal"
  | "fog"
  | "closure"
  | "speed_camera";

export const ROAD_REPORT_TYPES: { id: RoadReportType; label: string; ttlMinutes: number }[] = [
  { id: "pothole", label: "Pothole", ttlMinutes: 60 * 24 * 7 },
  { id: "accident", label: "Accident", ttlMinutes: 90 },
  { id: "police_check", label: "Police check", ttlMinutes: 120 },
  { id: "flooding", label: "Flooding", ttlMinutes: 60 * 12 },
  { id: "roadwork", label: "Roadwork", ttlMinutes: 60 * 24 * 3 },
  { id: "debris", label: "Debris", ttlMinutes: 120 },
  { id: "animal", label: "Animal on road", ttlMinutes: 30 },
  { id: "fog", label: "Dense fog", ttlMinutes: 180 },
  { id: "closure", label: "Road closed", ttlMinutes: 60 * 12 },
  { id: "speed_camera", label: "Speed camera", ttlMinutes: 60 * 24 * 30 }
];
