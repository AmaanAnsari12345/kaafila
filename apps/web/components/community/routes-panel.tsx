"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mountain, Navigation, Plus, Star, Trash2 } from "lucide-react";
import { decodePolyline, formatDistance, ROUTE_TAGS } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import type { ConvoySummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LiveMap } from "@/components/map/live-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, Input, Notice, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

interface ScenicRoute {
  id: string;
  title: string;
  description: string | null;
  polyline: string;
  distanceM: number;
  startName: string | null;
  endName: string | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  region: string | null;
  tags: string[];
  ratingCount: number;
  averageRating: number | null;
  myRating: number | null;
  author: { id: string; displayName: string; handle: string | null };
}

export function RoutesPanel({ notify }: { notify: (t: string, m?: string) => void }) {
  const { me } = useAuth();
  const router = useRouter();
  const [sort, setSort] = useState<"top" | "new">("top");
  const [tag, setTag] = useState("");
  const routes = useLoad<ScenicRoute[]>(() => api.get(`/social/routes?sort=${sort}${tag ? `&tag=${tag}` : ""}`), [sort, tag]);
  const [selected, setSelected] = useState<ScenicRoute | null>(null);
  const [sharing, setSharing] = useState(false);

  const rate = async (r: ScenicRoute, rating: number) => {
    try {
      await api.post(`/social/routes/${r.id}/rate`, { rating });
      routes.reload();
    } catch (err) {
      notify("Couldn't rate", errorMessage(err));
    }
  };

  const driveIt = async (r: ScenicRoute) => {
    try {
      const vehicle = me?.vehicles.find((v) => v.isDefault) ?? me?.vehicles[0];
      // Pin the router to the shared road with up to 6 evenly spaced via-points.
      const pts = decodePolyline(r.polyline);
      const waypoints = pts.length > 8 ? [1, 2, 3, 4, 5, 6].map((i) => pts[Math.floor((i * (pts.length - 1)) / 7)]!).map((p) => ({ lat: p.lat, lng: p.lng })) : undefined;
      const convoy = await api.post<{ id: string }>("/convoys", {
        name: r.title,
        origin: { lat: r.startLat, lng: r.startLng, name: r.startName ?? undefined },
        destination: { lat: r.endLat, lng: r.endLng, name: r.endName ?? undefined },
        waypoints,
        vehicleId: vehicle?.id
      });
      router.push(`/drive?c=${convoy.id}`);
    } catch (err) {
      notify("Couldn't start convoy", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sort} onChange={(e) => setSort(e.target.value as "top" | "new")} className="h-9 w-32" aria-label="Sort">
            <option value="top">Top rated</option>
            <option value="new">Newest</option>
          </Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 w-40" aria-label="Tag">
            <option value="">All roads</option>
            {ROUTE_TAGS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </Select>
          <Button size="sm" className="ml-auto" onClick={() => setSharing(true)}>
            <Plus className="h-4 w-4" /> Share a route
          </Button>
        </div>
        {routes.error ? <Notice tone="danger">{routes.error}</Notice> : null}
        {routes.data?.length === 0 ? <Empty>No routes yet. Finish a convoy and share the road you loved.</Empty> : null}
        {routes.data?.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelected(r)} className={cn("glass-panel rounded-lg p-4 text-left transition", selected?.id === r.id && "neon-glow")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display truncate font-semibold">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.startName ?? "Start"} → {r.endName ?? "End"} · {formatDistance(r.distanceM)} · by {r.author.displayName}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-sm text-amber-300">
                <Star className="h-4 w-4 fill-amber-300" /> {r.averageRating ?? "–"} <span className="text-xs text-muted-foreground">({r.ratingCount})</span>
              </span>
            </div>
            {r.tags.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <Badge key={t} variant="neutral">
                    {t.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-w-0">
        {selected ? (
          <Card className="sticky top-20 grid gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="hud-label">{selected.region ?? "Scenic route"}</p>
                <p className="font-display text-xl font-semibold">{selected.title}</p>
              </div>
              {selected.author.id === me?.id ? (
                <Button size="sm" variant="ghost" onClick={() => api.del(`/social/routes/${selected.id}`).then(() => (setSelected(null), routes.reload()))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <LiveMap key={selected.id} routePolyline={selected.polyline} vehicles={[]} className="h-80" />
            {selected.description ? <p className="whitespace-pre-wrap text-sm">{selected.description}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1" aria-label="Rate this route">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => rate(selected, n)} aria-label={`${n} stars`}>
                    <Star className={cn("h-6 w-6", (selected.myRating ?? 0) >= n ? "fill-amber-300 text-amber-300" : "text-muted-foreground")} />
                  </button>
                ))}
              </span>
              <Button onClick={() => driveIt(selected)}>
                <Navigation className="h-4 w-4" /> Drive this route
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="hud-corners flex min-h-80 flex-col items-center justify-center gap-2 text-center">
            <Mountain className="h-10 w-10 text-primary" />
            <p className="font-display">Pick a route to preview it</p>
            <p className="max-w-sm text-sm text-muted-foreground">Routes are shared from real convoys, so every road here has been driven by the community.</p>
          </Card>
        )}
      </div>
      <ShareRouteDialog open={sharing} onClose={() => setSharing(false)} onShared={routes.reload} notify={notify} />
    </div>
  );
}

function ShareRouteDialog({ open, onClose, onShared, notify }: { open: boolean; onClose: () => void; onShared: () => void; notify: (t: string, m?: string) => void }) {
  const convoys = useLoad<ConvoySummary[]>(open ? () => api.get("/convoys/mine") : null, [open]);
  const [convoyId, setConvoyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const share = async () => {
    try {
      await api.post("/social/routes", { convoyId, title, description: description || undefined, region: region || undefined, tags });
      notify("Route shared", "Thanks — the community can now drive it.");
      onShared();
      onClose();
    } catch (err) {
      notify("Couldn't share", errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share a route" description="Pick a convoy you drove; its planned route is shared (never anyone's live positions).">
      <div className="grid gap-3">
        <Field label="Convoy">
          <Select value={convoyId} onChange={(e) => setConvoyId(e.target.value)}>
            <option value="">Choose…</option>
            {convoys.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.originName ?? "?"} → {c.destinationName ?? "?"})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Tamhini ghat at sunrise" />
        </Field>
        <Field label="Region">
          <Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={80} placeholder="Western Ghats" />
        </Field>
        <Field label="What makes it great">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {ROUTE_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : x.length < 6 ? [...x, t] : x))}
              className={cn("rounded-full border px-2.5 py-1 text-xs", tags.includes(t) ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-50" : "border-white/10 text-muted-foreground")}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
        <Button onClick={share} disabled={!convoyId || title.trim().length < 3}>
          Share route
        </Button>
      </div>
    </Modal>
  );
}
