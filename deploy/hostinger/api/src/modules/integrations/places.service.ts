import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { geohashEncode, haversineMeters, overpassQuery, type GeoPoint, type Poi, type PoiCategory } from "@kaafila/shared";
import { RedisService } from "../../shared/redis/redis.service";
import { fetchJson } from "./http";
import { MapsService } from "./maps.service";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OpenMeteoCurrent {
  latitude: number;
  longitude: number;
  current?: { time: string; temperature_2m?: number; precipitation?: number; weather_code?: number; wind_speed_10m?: number; wind_gusts_10m?: number };
}

export interface WeatherPoint {
  position: GeoPoint;
  temperatureC: number | null;
  precipitationMm: number | null;
  windKph: number | null;
  gustKph: number | null;
  code: number | null;
  summary: string;
  drivingRisk: "low" | "moderate" | "high";
}

/** WMO weather interpretation codes as used by Open-Meteo. */
export function describeWeatherCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Unknown";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed";
}

@Injectable()
export class PlacesService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly maps: MapsService
  ) {}

  /**
   * Nearby POIs from OpenStreetMap through Overpass, cached per category + geohash-5 cell
   * (~5 km) for one hour so a whole convoy asking the same question costs one upstream call.
   */
  async nearby(category: PoiCategory, at: GeoPoint, radiusMeters = 8000, limit = 25): Promise<Poi[]> {
    const cell = geohashEncode(at, 5);
    const radiusBucket = radiusMeters <= 3000 ? 3000 : radiusMeters <= 8000 ? 8000 : 20000;
    const raw = await this.redis.remember(`poi:${category}:${cell}:${radiusBucket}`, 3600, async () => {
      if (!(await this.redis.allow("overpass:minute", 30, 60))) throw new Error("Places search is busy, try again shortly");
      const body = new URLSearchParams({ data: overpassQuery(category, at.lat, at.lng, radiusBucket, 60) });
      const data = await fetchJson<{ elements: OverpassElement[] }>(this.config.getOrThrow<string>("OVERPASS_BASE_URL"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": this.maps.userAgent },
        body,
        timeoutMs: 20_000
      });
      return data.elements
        .map((e) => ({ id: `${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, tags: e.tags ?? {} }))
        .filter((e): e is { id: string; lat: number; lng: number; tags: Record<string, string> } => typeof e.lat === "number" && typeof e.lng === "number");
    });

    return raw
      .map((e) => ({
        id: e.id,
        category,
        name: e.tags.name ?? e.tags.brand ?? e.tags.operator ?? defaultName(category),
        lat: e.lat,
        lng: e.lng,
        distanceMeters: Math.round(haversineMeters(at, { lat: e.lat, lng: e.lng })),
        phone: e.tags.phone ?? e.tags["contact:phone"],
        openingHours: e.tags.opening_hours,
        brand: e.tags.brand
      }))
      .filter((p) => p.distanceMeters <= radiusMeters * 1.1)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
  }

  /** Current weather at several points (Open-Meteo supports comma-separated coordinate lists). */
  async weatherAt(points: GeoPoint[]): Promise<WeatherPoint[]> {
    if (points.length === 0) return [];
    const rounded = points.slice(0, 8).map((p) => ({ lat: Number(p.lat.toFixed(2)), lng: Number(p.lng.toFixed(2)) }));
    const key = `wx:${rounded.map((p) => `${p.lat},${p.lng}`).join("|")}`;
    return this.redis.remember(key, 900, async () => {
      const params = new URLSearchParams({
        latitude: rounded.map((p) => p.lat).join(","),
        longitude: rounded.map((p) => p.lng).join(","),
        current: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
        timezone: "auto"
      });
      const apiKey = this.config.get<string>("OPEN_METEO_API_KEY");
      if (apiKey) params.set("apikey", apiKey);
      const data = await fetchJson<OpenMeteoCurrent | OpenMeteoCurrent[]>(`${this.config.getOrThrow<string>("WEATHER_BASE_URL")}?${params}`);
      const list = Array.isArray(data) ? data : [data];
      return list.map((d, i) => {
        const c: NonNullable<OpenMeteoCurrent["current"]> = d.current ?? { time: "" };
        const code = c.weather_code ?? null;
        const gust = c.wind_gusts_10m ?? null;
        const precip = c.precipitation ?? null;
        const risky = code !== null && (code === 45 || code === 48 || code >= 65 || (code >= 95 && code <= 99));
        const moderate = (precip ?? 0) > 0.5 || (gust ?? 0) > 50 || (code !== null && code >= 51);
        return {
          position: rounded[i] ?? { lat: d.latitude, lng: d.longitude },
          temperatureC: c.temperature_2m ?? null,
          precipitationMm: precip,
          windKph: c.wind_speed_10m ?? null,
          gustKph: gust,
          code,
          summary: describeWeatherCode(code),
          drivingRisk: risky ? "high" : moderate ? "moderate" : "low"
        } satisfies WeatherPoint;
      });
    });
  }
}

function defaultName(category: PoiCategory) {
  const names: Record<PoiCategory, string> = {
    fuel: "Fuel station",
    ev_charging: "EV charger",
    hospital: "Hospital / clinic",
    pharmacy: "Pharmacy",
    police: "Police",
    mechanic: "Car repair",
    tyres: "Tyre shop",
    toilets: "Toilets",
    food: "Food",
    lodging: "Stay",
    parking: "Parking"
  };
  return names[category];
}
