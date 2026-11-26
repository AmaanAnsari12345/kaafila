"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CloudSun, ExternalLink, MapPin, Phone, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { EMERGENCY_NUMBERS, POI_CATEGORIES, ROAD_REPORT_TYPES, ROADSIDE_GUIDES, emergencyNumbersFor, type CountryEmergency, type GeoPoint, type Poi, type PoiCategory } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatMeters, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/app-frame";
import { LiveMap } from "@/components/map/live-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Notice, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";

interface RoadReport {
  id: string;
  type: string;
  lat: number;
  lng: number;
  note: string | null;
  confirmations: number;
  dismissals: number;
  createdAt: string;
}

interface Weather {
  summary: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  gustKph: number | null;
  drivingRisk: "low" | "moderate" | "high";
}

export function RoadsideView() {
  const { status } = useAuth();
  const { notify, view } = useToast();
  const [pos, setPos] = useState<GeoPoint | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<CountryEmergency & { disclaimer?: string }>(emergencyNumbersFor(null));
  const [category, setCategory] = useState<PoiCategory>("fuel");
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [reports, setReports] = useState<RoadReport[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>("accident_scene");

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => (setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), setLocError(null)),
      (e) => setLocError(e.code === e.PERMISSION_DENIED ? "Location permission denied — emergency numbers below default to 112." : e.message),
      { enableHighAccuracy: true, timeout: 15_000 }
    );

  useEffect(locate, []);

  useEffect(() => {
    if (!pos) return;
    api
      .get<CountryEmergency & { disclaimer: string }>(`/roadside/emergency?lat=${pos.lat}&lng=${pos.lng}`, { auth: false })
      .then(setEmergency)
      .catch(() => undefined);
    if (status !== "signed_in") return;
    api.get<RoadReport[]>(`/roadside/reports?lat=${pos.lat}&lng=${pos.lng}`).then(setReports).catch(() => undefined);
    api.get<Weather[]>(`/roadside/weather?lat=${pos.lat}&lng=${pos.lng}`).then((w) => setWeather(w[0] ?? null)).catch(() => undefined);
  }, [pos, status]);

  useEffect(() => {
    if (!pos || status !== "signed_in") return;
    setPoiError(null);
    api
      .get<Poi[]>(`/roadside/nearby?category=${category}&lat=${pos.lat}&lng=${pos.lng}&radius=10000`)
      .then(setPois)
      .catch((e) => (setPois([]), setPoiError(errorMessage(e))));
  }, [pos, category, status]);

  const report = async (type: string) => {
    if (!pos) return notify("Location needed", "Allow location to report a hazard where you are.");
    try {
      await api.post("/roadside/reports", { type, lat: pos.lat, lng: pos.lng });
      setReports(await api.get<RoadReport[]>(`/roadside/reports?lat=${pos.lat}&lng=${pos.lng}`));
      notify("Thanks — reported", "Drivers nearby will see it. Others confirm or dismiss it.");
    } catch (err) {
      notify("Couldn't report", errorMessage(err));
    }
  };

  const vote = async (id: string, stillThere: boolean) => {
    try {
      await api.post(`/roadside/reports/${id}/vote`, { stillThere });
      if (pos) setReports(await api.get<RoadReport[]>(`/roadside/reports?lat=${pos.lat}&lng=${pos.lng}`));
    } catch (err) {
      notify("Couldn't vote", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Roadside" title="Help on the road" description="Emergency numbers, step-by-step breakdown guides that work offline, nearby services and live road reports." />

      <Card className="border-rose-400/30 bg-rose-950/20">
        <CardTitle eyebrow="Emergency" title={emergency.country} right={<Badge variant="danger">tap to call</Badge>} />
        <div className="grid gap-2 sm:grid-cols-3">
          {emergency.numbers.map((n) => (
            <a key={n.number + n.label} href={`tel:${n.number}`} className="flex items-center gap-3 rounded-lg bg-rose-600/90 p-3 text-white transition hover:bg-rose-500">
              <Phone className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-2xl font-bold tabular-nums">{n.number}</span>
                <span className="block text-xs">{n.label}</span>
                {n.note ? <span className="block text-[11px] text-rose-100/80">{n.note}</span> : null}
              </span>
            </a>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{emergency.disclaimer ?? "Numbers vary by region. Verify locally; 112 works on most mobile networks."}</span>
          <Select
            className="ml-auto h-8 w-48 text-xs"
            value={emergency.countryCode}
            onChange={(e) => setEmergency(emergencyNumbersFor(e.target.value))}
            aria-label="Choose country"
          >
            <option value="ZZ">Choose country…</option>
            {EMERGENCY_NUMBERS.map((c) => (
              <option key={c.countryCode} value={c.countryCode}>
                {c.country}
              </option>
            ))}
          </Select>
        </div>
        {locError ? <p className="mt-2 text-xs text-amber-200">{locError}</p> : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="grid content-start gap-4">
          <Card>
            <CardTitle eyebrow="Nearby" title="Services around you" right={pos ? null : <Button size="sm" variant="outline" onClick={locate}><MapPin className="h-4 w-4" /> Locate me</Button>} />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {POI_CATEGORIES.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={cn("rounded-full border px-3 py-1 text-xs", category === c.id ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:text-foreground")}>
                  {c.label}
                </button>
              ))}
            </div>
            {status !== "signed_in" ? <Notice tone="info">Sign in to search nearby services and road reports.</Notice> : null}
            {poiError ? <Notice tone="warn">{poiError}</Notice> : null}
            {pos && status === "signed_in" ? (
              <LiveMap vehicles={[]} me={pos} pois={pois.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, category: p.category }))} className="h-72" />
            ) : null}
            <ul className="mt-3 grid gap-2">
              {status === "signed_in" && pos && pois.length === 0 && !poiError ? <Empty>Nothing found within 10 km in OpenStreetMap.</Empty> : null}
              {pois.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMeters(p.distanceMeters)} straight line{p.openingHours ? ` · ${p.openingHours}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="rounded-md border border-white/10 p-2 hover:bg-white/10" aria-label={`Call ${p.name}`}>
                        <Phone className="h-4 w-4" />
                      </a>
                    ) : null}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-white/10 p-2 hover:bg-white/10"
                      aria-label={`Directions to ${p.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Place data © OpenStreetMap contributors. Opening hours may be outdated — call ahead.</p>
          </Card>

          {status === "signed_in" ? (
            <Card>
              <CardTitle eyebrow="Community" title="Road reports nearby" right={<TriangleAlert className="h-4 w-4 text-amber-300" />} />
              <div className="mb-3 flex flex-wrap gap-1.5">
                {ROAD_REPORT_TYPES.map((t) => (
                  <Button key={t.id} size="sm" variant="outline" onClick={() => report(t.id)}>
                    {t.label}
                  </Button>
                ))}
              </div>
              {reports.length === 0 ? <Empty>No active reports within ~15 km.</Empty> : null}
              <ul className="grid gap-2">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-3 text-sm">
                    <span>
                      <span className="font-medium">{ROAD_REPORT_TYPES.find((t) => t.id === r.type)?.label ?? r.type}</span>
                      <span className="block text-xs text-muted-foreground">
                        {pos ? `${formatMeters(Math.hypot((r.lat - pos.lat) * 111_320, (r.lng - pos.lng) * 111_320 * Math.cos((pos.lat * Math.PI) / 180)))} away · ` : ""}
                        {timeAgo(r.createdAt)} · {r.confirmations} confirmed
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => vote(r.id, true)} aria-label="Still there">
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => vote(r.id, false)} aria-label="Gone">
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          {weather ? (
            <Card>
              <CardTitle eyebrow="Weather here" title={weather.summary} right={<CloudSun className="h-4 w-4 text-muted-foreground" />} />
              <p className="text-sm">
                {weather.temperatureC !== null ? `${Math.round(weather.temperatureC)}°C` : ""}
                {weather.precipitationMm ? ` · ${weather.precipitationMm} mm rain` : ""}
                {weather.gustKph ? ` · gusts ${Math.round(weather.gustKph)} km/h` : ""}
              </p>
              <Badge className="mt-2" variant={weather.drivingRisk === "high" ? "danger" : weather.drivingRisk === "moderate" ? "amber" : "default"}>
                driving risk: {weather.drivingRisk}
              </Badge>
            </Card>
          ) : null}
          <Card>
            <CardTitle eyebrow="Works offline" title="Breakdown & emergency guides" />
            <div className="grid gap-2">
              {ROADSIDE_GUIDES.map((g) => (
                <div key={g.id} className="rounded-lg border border-white/10">
                  <button type="button" onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left" aria-expanded={openGuide === g.id}>
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", g.urgency === "critical" ? "bg-rose-400" : g.urgency === "high" ? "bg-amber-300" : "bg-primary")} />
                      <span className="font-medium">{g.title}</span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition", openGuide === g.id && "rotate-180")} />
                  </button>
                  {openGuide === g.id ? (
                    <div className="border-t border-white/10 p-3 text-sm">
                      <p className="text-muted-foreground">{g.summary}</p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                        {g.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <p className="mt-3 text-xs font-semibold uppercase text-rose-300">Do not</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-rose-100/90">
                        {g.doNot.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">General guidance, not a substitute for professional help or local rules.</p>
          </Card>
        </div>
      </div>
      {view}
    </div>
  );
}

