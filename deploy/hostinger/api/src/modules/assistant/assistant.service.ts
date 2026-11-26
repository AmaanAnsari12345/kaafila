import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  documentStatus,
  emergencyNumbersFor,
  formatDistance,
  formatDuration,
  guideById,
  POI_CATEGORIES,
  reminderStatus,
  ROADSIDE_GUIDES,
  type ConvoyIntelReport,
  type GeoPoint,
  type PoiCategory
} from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { EntitlementsService } from "../core/entitlements.service";
import { MapsService } from "../integrations/maps.service";
import { PlacesService } from "../integrations/places.service";
import { IntelService } from "../intel/intel.service";
import { TrackingService } from "../tracking/tracking.service";

export interface AssistantAnswer {
  answer: string;
  mode: "ai" | "rules";
  model?: string;
  toolsUsed: string[];
  upgradeHint?: string;
}

const SYSTEM_PROMPT = `You are KAAFILA Co-pilot, the in-journey assistant for groups of cars driving together (a convoy).

Who you talk to: a driver or navigator, often while the car is moving. Answer in at most three short sentences unless they ask for detail, in plain spoken language that sounds natural when read aloud. Lead with the action.

Ground every factual statement about the convoy, places, weather, numbers or vehicles in a tool result from this conversation. If a tool returns nothing useful or fails, say what you could not check instead of guessing. Never invent distances, phone numbers, prices or opening hours.

Safety comes first:
- For an accident, injury, fire or medical emergency, tell them to call the local emergency number (get it with get_emergency_info) and to raise a KAAFILA SOS, before anything else.
- Never encourage a driver to type, read long text or look at the screen while moving; suggest pulling over or handing the phone to the navigator.
- Do not advise speeding to catch up; the Elastic Band and regroup features exist so the convoy waits.

Distances are metric. Currency is Indian rupees unless the user says otherwise.`;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly client?: Anthropic;
  private readonly model: string;
  private readonly effort: "low" | "medium" | "high" | "xhigh" | "max";

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly intel: IntelService,
    private readonly tracking: TrackingService,
    private readonly places: PlacesService,
    private readonly maps: MapsService
  ) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY");
    if (apiKey) this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    this.model = config.get<string>("ASSISTANT_MODEL") ?? "claude-opus-5-5";
    this.effort = config.get("ASSISTANT_EFFORT") ?? "medium";
  }

  async ask(user: AuthenticatedUser, message: string, convoyId?: string, position?: GeoPoint): Promise<AssistantAnswer> {
    if (convoyId) await this.access.requireMember(convoyId, user);
    if (!(await this.redis.allow(`rl:assistant:${user.id}`, 20, 3600))) {
      throw new HttpException("You've reached the co-pilot limit for this hour", HttpStatus.TOO_MANY_REQUESTS);
    }

    const plan = await this.entitlements.planForUser(user.id);
    const ctx = new ToolContext(this, user, convoyId, position);
    let result: AssistantAnswer;

    if (!this.client) {
      result = await this.rules(ctx, message);
    } else if (plan === "explorer") {
      result = { ...(await this.rules(ctx, message)), upgradeHint: "The full AI co-pilot is part of KAAFILA Drive (₹500 per car per month)." };
    } else {
      result = await this.claude(ctx, message).catch(async (err) => {
        this.logger.error(`Claude call failed, falling back to rules: ${(err as Error).message}`);
        return this.rules(ctx, message);
      });
    }

    await this.prisma.assistantMessage.createMany({
      data: [
        { userId: user.id, convoyId, role: "user", content: message },
        { userId: user.id, convoyId, role: "assistant", content: result.answer, model: result.model ?? result.mode }
      ]
    });
    return result;
  }

  async history(user: AuthenticatedUser, convoyId?: string) {
    if (convoyId) await this.access.requireMember(convoyId, user);
    const rows = await this.prisma.assistantMessage.findMany({
      where: { userId: user.id, convoyId: convoyId ?? null },
      orderBy: { createdAt: "desc" },
      take: 30
    });
    return rows.reverse().map((r) => ({ role: r.role, content: r.content, createdAtIso: r.createdAt.toISOString() }));
  }

  /* --------------------------------- Claude --------------------------------- */

  private async claude(ctx: ToolContext, message: string): Promise<AssistantAnswer> {
    const recent = await this.prisma.assistantMessage.findMany({
      where: { userId: ctx.user.id, convoyId: ctx.convoyId ?? null, createdAt: { gt: new Date(Date.now() - 6 * 3600_000) } },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    const history: Anthropic.Beta.BetaMessageParam[] = recent
      .reverse()
      .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));
    // The API requires the conversation to start with a user turn.
    while (history.length && history[0]!.role !== "user") history.shift();

    const toolsUsed: string[] = [];
    const tools = ctx.tools((name) => toolsUsed.push(name));

    const runner = this.client!.beta.messages.toolRunner({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: `${ctx.contextLine()}\n\n${message}` }],
      tools,
      output_config: { effort: this.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_iterations: 6,
      thread: false
    });
    const final = await runner.runUntilDone();

    if (final.stop_reason === "refusal") {
      return { answer: "I can't help with that one. For anything urgent on the road, call the local emergency number or raise a KAAFILA SOS.", mode: "ai", model: final.model, toolsUsed };
    }
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { answer: text || "I couldn't put together an answer. Try asking again in a moment.", mode: "ai", model: final.model, toolsUsed };
  }

  /* ------------------------------ tool backends ------------------------------ */

  async convoyStatus(user: AuthenticatedUser, convoyId?: string) {
    if (!convoyId) return { error: "The user is not in a convoy right now." };
    const [meta, vehicles] = await Promise.all([this.tracking.convoyMeta(convoyId), this.tracking.liveVehicles(convoyId)]);
    const now = Date.now();
    return {
      name: meta.name,
      status: meta.status,
      destination: meta.destinationName ?? meta.destination,
      regroup: meta.regroup ? { name: meta.regroup.name, position: meta.regroup.position } : null,
      vehicles: vehicles.map((v) => ({
        driver: v.displayName,
        vehicle: v.vehicleName,
        role: v.role,
        speedKph: Math.round(v.speedKph),
        lastSeenSecondsAgo: Math.round((now - Date.parse(v.capturedAtIso)) / 1000),
        fuelPct: v.fuelPct,
        batteryPct: v.batteryPct,
        isMe: v.userId === user.id
      }))
    };
  }

  async intelSummary(user: AuthenticatedUser, convoyId?: string) {
    if (!convoyId) return { error: "The user is not in a convoy right now." };
    const r: ConvoyIntelReport = await this.intel.forConvoy(user, convoyId);
    return {
      healthScore: r.healthScore,
      formationFrontToBack: r.formation.entries.map((e) => ({
        driver: e.displayName,
        gapToCarAhead: e.gapAheadMeters === null ? null : formatDistance(e.gapAheadMeters),
        offRoute: e.offRoute,
        signalLost: e.stale
      })),
      convoyStretch: formatDistance(r.formation.stretchMeters),
      remainingForLeader: formatDistance(r.formation.remainingMeters),
      elasticBand: r.elastic.message,
      range: r.range.advice.message,
      fatigue: r.fatigue.filter((f) => f.level !== "ok").map((f) => `${f.displayName}: ${f.message}`),
      regroupSuggestions: r.regroupSuggestions.map((s) => `${s.name} (everyone there within ${formatDuration(s.maxEtaSeconds)})`),
      deadZonesAhead: r.deadZones.map((z) => `${formatDistance(z.distanceAheadMeters)} ahead, about ${formatDistance(z.lengthMeters)} long`),
      openSos: r.openSosCount,
      notes: r.notes
    };
  }

  async positionFor(user: AuthenticatedUser, convoyId: string | undefined, near: "me" | "lead" | "regroup", fallback?: GeoPoint): Promise<GeoPoint | null> {
    if (convoyId) {
      const [vehicles, meta] = await Promise.all([this.tracking.liveVehicles(convoyId), this.tracking.convoyMeta(convoyId)]);
      if (near === "regroup" && meta.regroup) return meta.regroup.position;
      if (near === "lead") {
        const lead = vehicles.find((v) => v.userId === meta.leaderUserId);
        if (lead) return lead.position;
      }
      const mine = vehicles.find((v) => v.userId === user.id);
      if (mine) return mine.position;
    }
    return fallback ?? null;
  }

  async nearby(position: GeoPoint | null, category: PoiCategory) {
    if (!position) return { error: "No location available. Ask the user to enable location." };
    try {
      const pois = await this.places.nearby(category, position, 10_000, 8);
      return pois.map((p) => ({ name: p.name, distance: formatDistance(p.distanceMeters), phone: p.phone, openingHours: p.openingHours, lat: p.lat, lng: p.lng }));
    } catch (err) {
      return { error: `Places lookup failed: ${(err as Error).message}` };
    }
  }

  async routeWeather(user: AuthenticatedUser, convoyId: string | undefined, position: GeoPoint | null) {
    try {
      const points: GeoPoint[] = [];
      if (convoyId) {
        const meta = await this.tracking.convoyMeta(convoyId);
        points.push(position ?? meta.origin, meta.destination);
      } else if (position) points.push(position);
      if (!points.length) return { error: "No location available." };
      const wx = await this.places.weatherAt(points);
      return wx.map((w, i) => ({ where: i === 0 ? "current position" : "destination", summary: w.summary, temperatureC: w.temperatureC, precipitationMm: w.precipitationMm, gustKph: w.gustKph, drivingRisk: w.drivingRisk }));
    } catch (err) {
      return { error: `Weather lookup failed: ${(err as Error).message}` };
    }
  }

  async emergency(position: GeoPoint | null) {
    const country = position ? await this.maps.reverseCountry(position) : null;
    const info = emergencyNumbersFor(country);
    return { country: info.country, numbers: info.numbers, note: "Numbers vary by region; verify locally. 112 works on most mobile networks." };
  }

  async vehicleCare(userId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { userId },
      include: { reminders: true, documents: true, telemetrySamples: { orderBy: { capturedAt: "desc" }, take: 1 } }
    });
    return vehicles.map((v) => ({
      vehicle: v.name,
      odometerKm: v.odometerKm,
      reminders: v.reminders
        .map((r) => ({ title: r.title, ...reminderStatus({ dueAtIso: r.dueAt?.toISOString(), dueOdometerKm: r.dueOdometerKm }, v.odometerKm) }))
        .filter((r) => r.state !== "ok")
        .map((r) => `${r.title}: ${r.label}`),
      documents: v.documents
        .map((d) => ({ kind: d.kind, ...documentStatus(d.expiresAt?.toISOString()) }))
        .filter((d) => d.state === "expired" || d.state === "expiring")
        .map((d) => `${d.kind}: ${d.state === "expired" ? "expired" : `expires in ${d.daysLeft} days`}`),
      lastObd: v.telemetrySamples[0] ? { readings: v.telemetrySamples[0].readings, dtcs: v.telemetrySamples[0].dtcs, at: v.telemetrySamples[0].capturedAt.toISOString() } : null
    }));
  }

  /* --------------------------- rule-based fallback --------------------------- */

  private async rules(ctx: ToolContext, message: string): Promise<AssistantAnswer> {
    const m = message.toLowerCase();
    const used: string[] = [];
    const has = (...words: string[]) => words.some((w) => m.includes(w));
    const pos = await this.positionFor(ctx.user, ctx.convoyId, "me", ctx.position);

    if (has("accident", "crash", "injur", "bleed", "fire", "emergency", "sos", "ambulance")) {
      used.push("get_emergency_info");
      const info = await this.emergency(pos);
      const primary = info.numbers[0];
      const guide = guideById(has("fire") ? "vehicle_fire" : "accident_scene")!;
      return { answer: `Call ${primary?.number} (${primary?.label}) now and raise a KAAFILA SOS. ${guide.steps.slice(0, 2).join(" ")}`, mode: "rules", toolsUsed: used };
    }
    const guide = ROADSIDE_GUIDES.find((g) =>
      (g.id === "flat_tyre" && has("flat", "puncture", "tyre", "tire")) ||
      (g.id === "overheating" && has("overheat", "temperature", "steam", "coolant")) ||
      (g.id === "dead_battery" && has("battery", "jump", "won't start", "wont start")) ||
      (g.id === "brake_trouble" && has("brake")) ||
      (g.id === "flooded_road" && has("flood", "water on road")) ||
      (g.id === "lost_from_convoy" && has("lost", "where is everyone", "can't find"))
    );
    if (guide) {
      used.push("get_breakdown_guide");
      return { answer: `${guide.summary} First: ${guide.steps[0]} Then: ${guide.steps[1]} Full steps are in Roadside → ${guide.title}.`, mode: "rules", toolsUsed: used };
    }
    const category = POI_CATEGORIES.find((c) =>
      (c.id === "fuel" && has("fuel", "petrol", "diesel", "pump")) ||
      (c.id === "ev_charging" && has("charg", "ev ")) ||
      (c.id === "hospital" && has("hospital", "doctor", "clinic")) ||
      (c.id === "police" && has("police")) ||
      (c.id === "mechanic" && has("mechanic", "garage", "repair")) ||
      (c.id === "toilets" && has("toilet", "washroom", "restroom")) ||
      (c.id === "food" && has("food", "eat", "hungry", "dhaba", "restaurant", "coffee", "tea"))
    );
    if (category) {
      if (ctx.convoyId && (category.id === "fuel" || category.id === "ev_charging")) {
        used.push("get_convoy_intel");
        const intel = await this.intelSummary(ctx.user, ctx.convoyId);
        if (!("error" in intel) && intel.range) return { answer: intel.range, mode: "rules", toolsUsed: used };
      }
      used.push("find_nearby_services");
      const res = await this.nearby(pos, category.id);
      if (Array.isArray(res) && res.length) {
        const top = res.slice(0, 3).map((p) => `${p.name} (${p.distance})`).join(", ");
        return { answer: `Nearest ${category.label.toLowerCase()}: ${top}.`, mode: "rules", toolsUsed: used };
      }
      return { answer: `I couldn't find ${category.label.toLowerCase()} nearby right now${!Array.isArray(res) && res.error ? ` (${res.error})` : ""}.`, mode: "rules", toolsUsed: used };
    }
    if (has("weather", "rain", "fog", "storm", "snow")) {
      used.push("get_route_weather");
      const wx = await this.routeWeather(ctx.user, ctx.convoyId, pos);
      if (Array.isArray(wx)) return { answer: wx.map((w) => `${w.where}: ${w.summary}${w.temperatureC !== null ? `, ${Math.round(w.temperatureC)}°C` : ""} (driving risk ${w.drivingRisk})`).join(". ") + ".", mode: "rules", toolsUsed: used };
      return { answer: wx.error, mode: "rules", toolsUsed: used };
    }
    if (has("service", "oil", "insurance", "puc", "document", "reminder", "maintenance")) {
      used.push("get_vehicle_care");
      const care = await this.vehicleCare(ctx.user.id);
      const items = care.flatMap((c) => [...c.reminders, ...c.documents].map((x) => `${c.vehicle} — ${x}`));
      return { answer: items.length ? `Needs attention: ${items.slice(0, 4).join("; ")}.` : "Nothing is due in your garage right now.", mode: "rules", toolsUsed: used };
    }
    if (ctx.convoyId) {
      used.push("get_convoy_intel");
      const intel = await this.intelSummary(ctx.user, ctx.convoyId);
      if ("error" in intel) return { answer: String(intel.error), mode: "rules", toolsUsed: used };
      const parts = [intel.elasticBand, `Stretch ${intel.convoyStretch}, ${intel.remainingForLeader} to go for the leader.`];
      if (intel.fatigue.length) parts.push(intel.fatigue[0]!);
      if (intel.regroupSuggestions.length) parts.push(`Suggested regroup: ${intel.regroupSuggestions[0]}.`);
      if (intel.deadZonesAhead.length) parts.push(`Signal usually drops ${intel.deadZonesAhead[0]}.`);
      return { answer: parts.join(" "), mode: "rules", toolsUsed: used };
    }
    return {
      answer: "I can check the convoy's formation, fuel range, regroup spots, weather, nearby fuel, food, hospitals or mechanics, breakdown steps and emergency numbers. Ask me about any of those.",
      mode: "rules",
      toolsUsed: used
    };
  }
}

/** Binds tools to the caller's identity and convoy so the model can never reach other convoys. */
class ToolContext {
  constructor(
    private readonly svc: AssistantService,
    readonly user: AuthenticatedUser,
    readonly convoyId: string | undefined,
    readonly position: GeoPoint | undefined
  ) {}

  contextLine() {
    const parts = [`Context: user "${this.user.displayName}"`, this.convoyId ? "is in an active convoy" : "is not in a convoy", `time ${new Date().toISOString()}`];
    return `[${parts.join(", ")}]`;
  }

  tools(onUse: (name: string) => void) {
    const wrap = <T>(name: string, fn: () => Promise<T>) => async () => {
      onUse(name);
      try {
        return JSON.stringify(await fn());
      } catch (err) {
        if (err instanceof ForbiddenException) return JSON.stringify({ error: "Not allowed" });
        return JSON.stringify({ error: (err as Error).message });
      }
    };
    const categories = POI_CATEGORIES.map((c) => c.id) as [PoiCategory, ...PoiCategory[]];
    const guideIds = ROADSIDE_GUIDES.map((g) => g.id) as [string, ...string[]];

    return [
      betaTool({
        name: "get_convoy_status",
        description: "Live status of the user's current convoy: vehicles, drivers, speeds, last-seen times, fuel/battery levels, destination and regroup point.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
        run: wrap("get_convoy_status", () => this.svc.convoyStatus(this.user, this.convoyId))
      }),
      betaTool({
        name: "get_convoy_intel",
        description:
          "Convoy intelligence: front-to-back formation with gaps, convoy stretch, Elastic Band advice for the leader, weakest-link fuel/charge range with a recommended stop, driver fatigue, fair regroup suggestions and known signal dead zones ahead.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
        run: wrap("get_convoy_intel", () => this.svc.intelSummary(this.user, this.convoyId))
      }),
      betaTool({
        name: "find_nearby_services",
        description: "Find nearby services from OpenStreetMap (fuel, EV charging, hospital, pharmacy, police, mechanic, tyres, toilets, food, lodging, parking) near the user, the convoy leader or the regroup point.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", enum: categories },
            near: { type: "string", enum: ["me", "lead", "regroup"], description: "Whose position to search around" }
          },
          required: ["category", "near"],
          additionalProperties: false
        } as const,
        run: async (input) => {
          onUse("find_nearby_services");
          const pos = await this.svc.positionFor(this.user, this.convoyId, input.near, this.position);
          return JSON.stringify(await this.svc.nearby(pos, input.category));
        }
      }),
      betaTool({
        name: "get_route_weather",
        description: "Current weather and a simple driving-risk rating at the user's position and the convoy destination.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
        run: wrap("get_route_weather", async () => this.svc.routeWeather(this.user, this.convoyId, await this.svc.positionFor(this.user, this.convoyId, "me", this.position)))
      }),
      betaTool({
        name: "get_emergency_info",
        description: "Emergency phone numbers for the country the user is in.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
        run: wrap("get_emergency_info", async () => this.svc.emergency(await this.svc.positionFor(this.user, this.convoyId, "me", this.position)))
      }),
      betaTool({
        name: "get_breakdown_guide",
        description: "Step-by-step roadside guide (what to do and what not to do) for a breakdown or incident.",
        inputSchema: { type: "object", properties: { guide_id: { type: "string", enum: guideIds } }, required: ["guide_id"], additionalProperties: false } as const,
        run: async (input) => {
          onUse("get_breakdown_guide");
          return JSON.stringify(guideById(input.guide_id) ?? { error: "Unknown guide" });
        }
      }),
      betaTool({
        name: "get_vehicle_care",
        description: "The user's own vehicles: overdue or upcoming service reminders, expiring documents and the latest OBD-II readings and fault codes.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
        run: wrap("get_vehicle_care", () => this.svc.vehicleCare(this.user.id))
      })
    ];
  }
}
