import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { encodePolyline, haversineMeters, type GeoPoint, type RoutePlan } from "@kaafila/shared";
import { RedisService } from "../../shared/redis/redis.service";
import { fetchJson } from "./http";

export interface GeocodeResult {
  name: string;
  displayName: string;
  position: GeoPoint;
  countryCode?: string;
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: string }[];
}

interface GoogleRoutesResponse {
  routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: { country_code?: string };
}

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  readonly userAgent: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {
    this.userAgent = config.get<string>("OSM_USER_AGENT") ?? `KAAFILA/0.2 (+${config.get<string>("PUBLIC_APP_URL")})`;
  }

  /**
   * Plans a driving route. Order: configured provider → straight-line estimate (flagged).
   * Results are cached for 6 hours per origin/destination pair (rounded to ~10 m).
   */
  async planRoute(origin: GeoPoint, destination: GeoPoint, waypoints: GeoPoint[] = []): Promise<RoutePlan> {
    const pts = [origin, ...waypoints, destination];
    const key = `route:${createHash("sha1").update(pts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|")).digest("hex")}`;
    const cached = await this.redis.getJson<RoutePlan>(key).catch(() => null);
    if (cached) return cached;

    const provider = this.config.get<"osrm" | "google" | "none">("ROUTING_PROVIDER");
    let plan: RoutePlan | null = null;
    try {
      if (provider === "google" && this.config.get("GOOGLE_MAPS_API_KEY")) plan = await this.googleRoute(pts);
      else if (provider === "osrm") plan = await this.osrmRoute(pts);
    } catch (err) {
      this.logger.warn(`Routing provider failed, using estimate: ${(err as Error).message}`);
    }

    plan ??= this.estimate(pts);
    if (!plan.isEstimate) await this.redis.cacheJson(key, plan, 6 * 3600).catch(() => undefined);
    return plan;
  }

  private async osrmRoute(pts: GeoPoint[]): Promise<RoutePlan> {
    const base = this.config.getOrThrow<string>("OSRM_BASE_URL").replace(/\/$/, "");
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const data = await fetchJson<OsrmResponse>(`${base}/route/v1/driving/${coords}?overview=full&geometries=polyline`, {
      headers: { "User-Agent": this.userAgent },
      timeoutMs: 10_000
    });
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error(`OSRM returned ${data.code}`);
    return { provider: "osrm", distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), polyline: route.geometry, isEstimate: false };
  }

  private async googleRoute(pts: GeoPoint[]): Promise<RoutePlan> {
    const latLng = (p: GeoPoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const data = await fetchJson<GoogleRoutesResponse>("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.config.getOrThrow<string>("GOOGLE_MAPS_API_KEY"),
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
      },
      body: JSON.stringify({
        origin: latLng(pts[0]!),
        destination: latLng(pts[pts.length - 1]!),
        intermediates: pts.slice(1, -1).map(latLng),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE"
      }),
      timeoutMs: 10_000
    });
    const route = data.routes?.[0];
    if (!route?.polyline?.encodedPolyline) throw new Error("Google Routes returned no route");
    return {
      provider: "google",
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: Number.parseInt(route.duration ?? "0", 10),
      polyline: route.polyline.encodedPolyline,
      isEstimate: false
    };
  }

  /** Straight-line estimate: 1.3× road factor at 55 km/h. Always flagged as an estimate. */
  estimate(pts: GeoPoint[]): RoutePlan {
    let meters = 0;
    for (let i = 1; i < pts.length; i++) meters += haversineMeters(pts[i - 1]!, pts[i]!);
    const roadMeters = Math.round(meters * 1.3);
    return { provider: "estimate", distanceMeters: roadMeters, durationSeconds: Math.round(roadMeters / (55 / 3.6)), polyline: encodePolyline(pts), isEstimate: true };
  }

  /**
   * Forward geocoding through a Nominatim-compatible endpoint. The public instance allows at
   * most 1 request/second for the whole application, so calls are serialised through Redis
   * and cached for 24 hours. Self-host Nominatim for production volume.
   */
  async geocode(query: string, countryCodes?: string): Promise<GeocodeResult[]> {
    const q = query.trim().slice(0, 200);
    if (q.length < 3) return [];
    const key = `geo:q:${createHash("sha1").update(`${q.toLowerCase()}|${countryCodes ?? ""}`).digest("hex")}`;
    return this.redis.remember(key, 24 * 3600, async () => {
      await this.waitForGeocoderSlot();
      const base = this.config.getOrThrow<string>("GEOCODER_BASE_URL").replace(/\/$/, "");
      const params = new URLSearchParams({ q, format: "jsonv2", limit: "6", addressdetails: "1" });
      if (countryCodes) params.set("countrycodes", countryCodes);
      const items = await fetchJson<NominatimItem[]>(`${base}/search?${params}`, { headers: { "User-Agent": this.userAgent, "Accept-Language": "en" } });
      return items.map((i) => ({
        name: i.name || i.display_name.split(",")[0]!,
        displayName: i.display_name,
        position: { lat: Number(i.lat), lng: Number(i.lon) },
        countryCode: i.address?.country_code?.toUpperCase()
      }));
    });
  }

  async reverseCountry(p: GeoPoint): Promise<string | null> {
    const key = `geo:rev:${p.lat.toFixed(1)},${p.lng.toFixed(1)}`;
    return this.redis.remember(key, 7 * 24 * 3600, async () => {
      try {
        await this.waitForGeocoderSlot();
        const base = this.config.getOrThrow<string>("GEOCODER_BASE_URL").replace(/\/$/, "");
        const item = await fetchJson<NominatimItem>(`${base}/reverse?lat=${p.lat}&lon=${p.lng}&format=jsonv2&zoom=3`, {
          headers: { "User-Agent": this.userAgent }
        });
        return item.address?.country_code?.toUpperCase() ?? null;
      } catch {
        return null;
      }
    });
  }

  private async waitForGeocoderSlot() {
    for (let i = 0; i < 6; i++) {
      if (await this.redis.throttle("geo:slot", 1100)) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("Geocoder is busy, try again in a moment");
  }
}
