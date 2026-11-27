/**
 * Product knowledge for the co-pilot, generated deterministically from the shared registries so
 * the system prompt is byte-stable (prompt cache hits) and never drifts from what the app does.
 */
import {
  CAPABILITY_INFO,
  CONNECT_GUIDES,
  DRIVE_PRICE_PER_VEHICLE_INR,
  EMERGENCY_NUMBERS,
  FEATURE_REGISTRY,
  PLAN_CARDS,
  QUICK_SIGNALS,
  ROADSIDE_GUIDES
} from "@kaafila/shared";

const plans = PLAN_CARDS.map((p) => `- ${p.name} (${p.priceLabel} ${p.cadence}): ${p.tagline} Includes: ${p.features.join("; ")}.`).join("\n");

const features = FEATURE_REGISTRY.map((f) => `- ${f.name} [${f.stage}${f.target ? `, target ${f.target}` : ""}]: ${f.description}`).join("\n");

const guides = ROADSIDE_GUIDES.map((g) => `### ${g.title} (${g.urgency})\n${g.summary}\nSteps: ${g.steps.map((s, i) => `${i + 1}) ${s}`).join(" ")}\nDo not: ${g.doNot.join(" ")}`).join("\n\n");

const emergency = EMERGENCY_NUMBERS.map((c) => `- ${c.country}: ${c.numbers.map((n) => `${n.number} (${n.label})`).join(", ")}`).join("\n");

const connect = Object.entries(CONNECT_GUIDES)
  .map(([k, steps]) => `- ${k.replace("_", " ")}: ${steps.map((s) => `${s.title} — ${s.detail}`).join(" ")}`)
  .join("\n");

const capabilities = Object.values(CAPABILITY_INFO)
  .map((c) => `- ${c.label}: ${c.why} Limits: ${c.limits}`)
  .join("\n");

export const KAAFILA_KNOWLEDGE = `# KAAFILA product knowledge (authoritative)

KAAFILA is a group-driving operating system: it keeps several cars coordinated from the first invite to the last expense settlement. It complements navigation apps (keep your usual app for turn-by-turn) and focuses on the group.

## Pages
Drive (live convoy cockpit, map, quick signals, SOS, intel, members, chat, kitty, invite), Garage (cars, service reminders, document expiry, service log, OBD-II, pre-trip checklist, fuel log, build sheet), Connect (pair a dash tablet or passenger phone, OBD adapter, browser capability check), Roadside (emergency numbers, nearby services, road reports, offline guides), Co-pilot (this assistant, text or voice), Community (feed, clubs, profiles, scenic routes), Meetups (reviewed events, RSVP, check-in), Calls (convoy channels and club lounges), Billing (seats), Profile (safety card, UPI ID, background alerts, data export, account deletion).

## Plans and pricing
KAAFILA Drive costs ₹${DRIVE_PRICE_PER_VEHICLE_INR} per car per month. Seats are per car: buy N seats and assign them to your cars, or sponsor any car in a convoy you organise. Price includes GST by default. In India, if one subscription's monthly charge exceeds ₹15,000 (about 31+ cars), banks ask for approval on every renewal under RBI e-mandate rules; split into smaller subscriptions to keep renewals automatic.
${plans}

## Signature intelligence
- Elastic Band: measures convoy stretch along the route and tells the leader how much to ease off.
- Weakest-Link Range: finds the car with the least fuel/charge range and picks a stop it can reach.
- Fair Regroup: suggests the stop where the last car arrives soonest.
- Dead-Zone Forecast: warns where phone signal usually drops, learned from past convoys.
- Convoy Pulse: suggests a 15-minute break after about 2 hours of continuous driving.
- Crash-aware SOS: a sudden impact then a stop starts a 20-second cancellable countdown; it is an aid, not a certified safety system.
- Kitty: shared trip expenses settled in the fewest payments with UPI links.
- Family follow link: an expiring read-only live link for people at home.
- Ghost Leader trail: the exact path the leader drove.
Quick signals: ${QUICK_SIGNALS.map((q) => q.label).join(", ")}.

## Feature status (rolled out gradually)
${features}

## Devices and connectivity
${connect}
Browser capabilities:
${capabilities}

## Emergency numbers (verify locally; 112 works on most mobile networks)
${emergency}

## Roadside guides
${guides}
`;

export const SAFETY_RULES = `Safety comes first:
- For an accident, injury, fire or medical emergency, first tell them to call the local emergency number and raise a KAAFILA SOS.
- Never encourage a driver to type, read long text or look at the screen while moving; suggest pulling over or handing the phone to a passenger.
- Never advise speeding to catch up, racing on public roads, or anything illegal.
- Crash detection and roadside guides are aids, not professional help.`;
