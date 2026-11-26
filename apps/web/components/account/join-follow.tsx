"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Users } from "lucide-react";
import type { GeoPoint, LiveVehicleState, RegroupPoint, VehicleType } from "@kaafila/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInterval, useLoad } from "@/lib/hooks";
import { formatDateTime, formatKph, timeAgo, timeUntil } from "@/lib/utils";
import { LiveMap } from "@/components/map/live-map";
import { Badge } from "@/components/ui/badge";
import { Card, Notice } from "@/components/ui/field";

interface InvitePreview {
  id: string;
  name: string;
  status: string;
  originName: string | null;
  destinationName: string | null;
  plannedDepartureAt: string | null;
  maxVehicles: number;
  owner: { displayName: string };
  _count: { members: number };
}

export function JoinView({ code }: { code: string }) {
  const { status } = useAuth();
  const preview = useLoad<InvitePreview>(status === "signed_in" ? () => api.get(`/convoys/invite/${encodeURIComponent(code)}`) : null, [code, status]);
  return (
    <div className="mx-auto grid max-w-lg gap-4 py-6">
      <Card className="text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Convoy invite</p>
        <p className="mt-2 font-mono text-3xl font-semibold">{code.toUpperCase()}</p>
        {preview.data ? (
          <div className="mt-3 grid gap-1 text-sm">
            <p className="text-lg font-semibold">{preview.data.name}</p>
            <p className="text-muted-foreground">
              {preview.data.originName ?? "Start"} → {preview.data.destinationName ?? "Destination"}
            </p>
            <p className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {preview.data._count.members} joined
              </span>
              {preview.data.plannedDepartureAt ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {formatDateTime(preview.data.plannedDepartureAt)}
                </span>
              ) : null}
              <span>by {preview.data.owner.displayName}</span>
            </p>
          </div>
        ) : null}
        {preview.error ? <Notice tone="danger" className="mt-3">{preview.error}</Notice> : null}
        <div className="mt-4">
          {status === "signed_in" ? (
            <Link href={`/drive?join=${encodeURIComponent(code.toUpperCase())}`} className="inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground">
              Join this convoy
            </Link>
          ) : status === "signed_out" ? (
            <Link href="/login" className="inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground">
              Sign in to join
            </Link>
          ) : null}
        </div>
        {status === "signed_out" ? <p className="mt-3 text-xs text-muted-foreground">After signing in, open this link again or enter the code on the Drive page.</p> : null}
      </Card>
    </div>
  );
}

interface FollowData {
  convoy: { name: string; status: string; destination: GeoPoint; destinationName: string | null; routePolyline: string | null };
  regroup: RegroupPoint | null;
  expiresAtIso: string;
  vehicles: { vehicleId: string; displayName: string; vehicleName: string; vehicleType: VehicleType; position: GeoPoint; speedKph: number; headingDeg: number; lastSeenIso: string }[];
}

export function FollowView({ token }: { token: string }) {
  const [data, setData] = useState<FollowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api
      .get<FollowData>(`/public/follow/${encodeURIComponent(token)}`, { auth: false })
      .then((d) => (setData(d), setError(null)))
      .catch((e: Error) => setError(e.message));
  useLoad(() => load(), [token]);
  useInterval(() => void load(), error ? null : 10_000);

  const vehicles: LiveVehicleState[] = (data?.vehicles ?? []).map((v) => ({
    ...v,
    userId: v.vehicleId,
    convoyId: "public",
    role: "driver",
    capturedAtIso: v.lastSeenIso,
    plan: "explorer"
  }));

  return (
    <div className="mx-auto grid max-w-5xl gap-3 p-3 sm:p-5">
      <header className="flex items-center gap-2">
        <Image src="/brand/kaafila-mark.svg" alt="" width={28} height={28} />
        <span className="font-semibold">KAAFILA</span>
        <Badge variant="neutral">family follow</Badge>
      </header>
      {error ? (
        <Notice tone="warn">{error}</Notice>
      ) : data ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">{data.convoy.name}</h1>
            <p className="text-sm text-muted-foreground">
              Heading to {data.convoy.destinationName ?? "the destination"} · {data.convoy.status} · link {timeUntil(data.expiresAtIso) === "now" ? "expired" : `expires ${timeUntil(data.expiresAtIso)}`}
            </p>
          </div>
          <LiveMap routePolyline={data.convoy.routePolyline} vehicles={vehicles} regroup={data.regroup} className="h-[60vh] min-h-[360px]" />
          <div className="grid gap-2 sm:grid-cols-2">
            {data.vehicles.map((v) => (
              <Card key={v.vehicleId} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <span className="font-medium">{v.displayName}</span> · {v.vehicleName}
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {formatKph(v.speedKph)}
                  <br />
                  updated {timeAgo(v.lastSeenIso)}
                </span>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">Updates every 10 seconds. Positions are shared by the convoy for a limited time.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
