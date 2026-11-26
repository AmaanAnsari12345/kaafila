"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type Marker } from "maplibre-gl";
import { boundingBox, decodePolyline, type GeoPoint, type LiveVehicleState, type RegroupPoint } from "@kaafila/shared";
import { LocateFixed } from "lucide-react";
import { webConfig } from "@/lib/config";

export interface MapPoi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
}

interface LiveMapProps {
  routePolyline?: string | null;
  vehicles: LiveVehicleState[];
  selectedVehicleId?: string | null;
  breadcrumbs?: GeoPoint[];
  regroup?: RegroupPoint | null;
  deadZoneSegments?: GeoPoint[][];
  pois?: MapPoi[];
  me?: GeoPoint | null;
  /** centre the map here once when there is no route or vehicles to fit */
  focus?: GeoPoint | null;
  staleAfterSeconds?: number;
  className?: string;
  onVehicleClick?: (vehicleId: string) => void;
  onMapLongPress?: (p: GeoPoint) => void;
}

const ROLE_COLOR: Record<string, string> = {
  leader: "#f59e0b",
  owner: "#f59e0b",
  sweeper: "#a78bfa",
  navigator: "#38bdf8",
  driver: "#2dd4bf"
};

const POI_EMOJI: Record<string, string> = {
  fuel: "⛽",
  ev_charging: "🔌",
  hospital: "🏥",
  pharmacy: "💊",
  police: "🚓",
  mechanic: "🔧",
  tyres: "🛞",
  toilets: "🚻",
  food: "🍽",
  lodging: "🛏",
  parking: "🅿"
};

const line = (coords: GeoPoint[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords.map((p) => [p.lng, p.lat]) } });
const collection = (features: ReturnType<typeof line>[]) => ({ type: "FeatureCollection" as const, features });

function vehicleElement() {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "kaafila-vehicle";
  el.innerHTML = `<span class="kv-dot"><span class="kv-arrow"></span></span><span class="kv-label"></span>`;
  return el;
}

export function LiveMap({
  routePolyline,
  vehicles,
  selectedVehicleId,
  breadcrumbs = [],
  regroup,
  deadZoneSegments = [],
  pois = [],
  me,
  focus,
  staleAfterSeconds = 90,
  className,
  onVehicleClick,
  onMapLongPress
}: LiveMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const extra = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const clickRef = useRef(onVehicleClick);
  clickRef.current = onVehicleClick;
  const pressRef = useRef(onMapLongPress);
  pressRef.current = onMapLongPress;

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: webConfig.mapStyleUrl,
      center: [78.9629, 20.5937],
      zoom: 4,
      attributionControl: { compact: true }
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    m.on("error", (e) => {
      const msg = (e as { error?: Error }).error?.message ?? "";
      if (!m.isStyleLoaded() && /style|fetch|load/i.test(msg)) setFailed("Map tiles are unavailable (offline or blocked). Live data keeps working.");
    });
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: collection([]) });
      m.addSource("crumbs", { type: "geojson", data: collection([]) });
      m.addSource("deadzones", { type: "geojson", data: collection([]) });
      m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#0f766e", "line-width": 9, "line-opacity": 0.35 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#2dd4bf", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "deadzones", type: "line", source: "deadzones", paint: { "line-color": "#f43f5e", "line-width": 7, "line-opacity": 0.85 }, layout: { "line-cap": "round" } });
      m.addLayer({ id: "crumbs", type: "line", source: "crumbs", paint: { "line-color": "#fbbf24", "line-width": 3, "line-dasharray": [1.5, 1.5] } });
      setReady(true);
    });
    let pressTimer: number | undefined;
    m.on("contextmenu", (e) => pressRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    m.on("touchstart", (e) => {
      pressTimer = window.setTimeout(() => pressRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }), 650);
    });
    ["touchend", "touchmove", "dragstart"].forEach((evt) => m.on(evt as "touchend", () => window.clearTimeout(pressTimer)));
    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
      extra.current.clear();
    };
  }, []);

  // Route
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const pts = routePolyline ? decodePolyline(routePolyline) : [];
    (m.getSource("route") as GeoJSONSource | undefined)?.setData(collection(pts.length > 1 ? [line(pts)] : []));
    if (pts.length > 1 && !fitted.current) {
      const b = boundingBox(pts);
      m.fitBounds([[b.minLng, b.minLat], [b.maxLng, b.maxLat]], { padding: 60, duration: 0 });
      fitted.current = true;
    }
  }, [routePolyline, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("crumbs") as GeoJSONSource | undefined)?.setData(collection(breadcrumbs.length > 1 ? [line(breadcrumbs)] : []));
  }, [breadcrumbs, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("deadzones") as GeoJSONSource | undefined)?.setData(collection(deadZoneSegments.filter((s) => s.length > 1).map(line)));
  }, [deadZoneSegments, ready]);

  // Vehicles
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const now = Date.now();
    const seen = new Set<string>();
    for (const v of vehicles) {
      seen.add(v.vehicleId);
      let marker = markers.current.get(v.vehicleId);
      if (!marker) {
        const el = vehicleElement();
        el.addEventListener("click", () => clickRef.current?.(v.vehicleId));
        marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([v.position.lng, v.position.lat]).addTo(m);
        markers.current.set(v.vehicleId, marker);
      }
      marker.setLngLat([v.position.lng, v.position.lat]);
      const el = marker.getElement();
      const stale = now - Date.parse(v.capturedAtIso) > staleAfterSeconds * 1000;
      el.style.setProperty("--kv-color", stale ? "#64748b" : (ROLE_COLOR[v.role] ?? "#2dd4bf"));
      el.classList.toggle("kv-selected", v.vehicleId === selectedVehicleId);
      el.setAttribute("aria-label", `${v.displayName}, ${Math.round(v.speedKph)} km/h${stale ? ", signal lost" : ""}`);
      (el.querySelector(".kv-arrow") as HTMLElement).style.transform = `rotate(${v.headingDeg}deg)`;
      (el.querySelector(".kv-label") as HTMLElement).textContent = `${v.displayName} · ${Math.round(v.speedKph)}`;
    }
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    if (!fitted.current && vehicles.length) {
      const b = boundingBox(vehicles.map((v) => v.position));
      m.fitBounds([[b.minLng - 0.02, b.minLat - 0.02], [b.maxLng + 0.02, b.maxLat + 0.02]], { duration: 0, maxZoom: 11 });
      fitted.current = true;
    }
  }, [vehicles, selectedVehicleId, staleAfterSeconds]);

  // Regroup, POIs, me
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const marker of extra.current.values()) marker.remove();
    extra.current.clear();
    if (regroup) {
      const el = document.createElement("div");
      el.className = "kaafila-pin kaafila-pin-regroup";
      el.innerHTML = `<span>⚑</span><em>${escapeHtml(regroup.name)}</em>`;
      extra.current.set("regroup", new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([regroup.position.lng, regroup.position.lat]).addTo(m));
    }
    for (const p of pois) {
      const el = document.createElement("div");
      el.className = "kaafila-pin";
      el.title = p.name;
      el.innerHTML = `<span>${POI_EMOJI[p.category] ?? "•"}</span>`;
      extra.current.set(`poi:${p.id}`, new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).setPopup(new maplibregl.Popup({ offset: 18 }).setText(p.name)).addTo(m));
    }
    if (me) {
      const el = document.createElement("div");
      el.className = "kaafila-me";
      extra.current.set("me", new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m));
    }
    const target = focus ?? me;
    if (target && !fitted.current && !routePolyline && vehicles.length === 0) {
      m.jumpTo({ center: [target.lng, target.lat], zoom: 13 });
      fitted.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regroup, pois, me, focus]);

  const recenter = () => {
    const m = map.current;
    if (!m) return;
    const pts = vehicles.map((v) => v.position);
    if (me) pts.push(me);
    if (!pts.length) return;
    const b = boundingBox(pts);
    m.fitBounds([[b.minLng - 0.01, b.minLat - 0.01], [b.maxLng + 0.01, b.maxLat + 0.01]], { padding: 60, maxZoom: 14 });
  };

  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#0b1010] ${className ?? "h-[520px]"}`}>
      <div ref={container} className="h-full w-full" />
      <button
        type="button"
        onClick={recenter}
        className="absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white backdrop-blur hover:bg-black/80"
        aria-label="Fit convoy in view"
        title="Fit convoy in view"
      >
        <LocateFixed className="h-5 w-5" />
      </button>
      {failed ? (
        <div className="absolute inset-x-4 top-4 z-10 rounded-lg border border-amber-300/30 bg-black/75 p-3 text-xs text-amber-100 backdrop-blur">{failed}</div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
