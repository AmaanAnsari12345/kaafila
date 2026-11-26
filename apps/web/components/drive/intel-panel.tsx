"use client";

import { Activity, BatteryWarning, Coffee, Fuel, MapPin, RadioTower, Rows3, SignalZero } from "lucide-react";
import { formatDistance, formatDuration, type ConvoyIntelReport } from "@kaafila/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, Notice } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface Props {
  intel: ConvoyIntelReport | null;
  canCommand: boolean;
  onSetRegroup: (s: { name: string; lat: number; lng: number }) => void;
  onLeaderEaseOff?: () => void;
  loading?: boolean;
}

export function IntelPanel({ intel, canCommand, onSetRegroup, onLeaderEaseOff, loading }: Props) {
  if (!intel) {
    return <Card><p className="text-sm text-muted-foreground">{loading ? "Computing convoy intelligence…" : "Intelligence appears once cars start sending their position."}</p></Card>;
  }
  const scoreTone = intel.healthScore >= 85 ? "text-primary" : intel.healthScore >= 60 ? "text-amber-300" : "text-rose-300";
  const elasticTone = intel.elastic.level === "tight" ? "default" : intel.elastic.level === "stretching" ? "amber" : "danger";
  const rangeTone = intel.range.advice.status === "ok" ? "default" : intel.range.advice.status === "stop_now" ? "danger" : intel.range.advice.status === "unknown" ? "neutral" : "amber";
  const tired = intel.fatigue.filter((f) => f.level !== "ok");

  return (
    <div className="grid gap-3">
      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Convoy health</p>
          <p className={cn("text-4xl font-semibold tabular-nums", scoreTone)}>{intel.healthScore}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm">
          <span className="text-muted-foreground">Stretch</span>
          <span className="font-medium tabular-nums">{formatDistance(intel.formation.stretchMeters)}</span>
          <span className="text-muted-foreground">To go</span>
          <span className="font-medium tabular-nums">{formatDistance(intel.formation.remainingMeters)}</span>
          <span className="text-muted-foreground">Off route</span>
          <span className="font-medium tabular-nums">{intel.formation.offRouteCount}</span>
          <span className="text-muted-foreground">No signal</span>
          <span className="font-medium tabular-nums">{intel.formation.staleCount}</span>
        </div>
      </Card>

      <Card>
        <CardTitle eyebrow="Elastic Band" title="Convoy pacing" right={<Badge variant={elasticTone}>{intel.elastic.level}</Badge>} />
        <p className="text-sm">{intel.elastic.message}</p>
        {intel.elastic.level !== "tight" ? (
          <p className="mt-2 text-xs text-muted-foreground">Tail is about {formatDuration(intel.elastic.tailLagSeconds)} behind the leader.</p>
        ) : null}
        {onLeaderEaseOff && intel.elastic.level !== "tight" ? (
          <Button size="sm" variant="outline" className="mt-3" onClick={onLeaderEaseOff}>
            <Activity className="h-4 w-4" />
            Leader eases off {intel.elastic.leaderSpeedDeltaKph} km/h
          </Button>
        ) : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Weakest-Link Range" title="Fuel & charge" right={<Badge variant={rangeTone}>{intel.range.convoyRangeKm !== null ? `${intel.range.convoyRangeKm} km` : "unknown"}</Badge>} />
        <p className="text-sm">{intel.range.advice.message}</p>
        {intel.range.advice.stop ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Fuel className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="truncate">{intel.range.advice.stop.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatDistance(intel.range.advice.stop.distanceAheadMeters)}</span>
          </div>
        ) : null}
        {intel.range.unknownCount ? <p className="mt-2 text-xs text-muted-foreground">{intel.range.unknownCount} car(s) haven't shared fuel level or full-tank range.</p> : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Convoy Pulse" title="Driver fatigue" right={tired.length ? <Badge variant="amber">{tired.length}</Badge> : <Badge>rested</Badge>} />
        {tired.length ? (
          <ul className="grid gap-2 text-sm">
            {tired.map((f) => (
              <li key={f.vehicleId} className="flex items-start gap-2">
                <Coffee className={cn("mt-0.5 h-4 w-4 shrink-0", f.level === "due" ? "text-rose-300" : "text-amber-300")} />
                <span>
                  <span className="font-medium">{f.displayName}</span> — {f.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Everyone is within the 2-hour driving window.</p>
        )}
      </Card>

      {intel.regroupSuggestions.length ? (
        <Card>
          <CardTitle eyebrow="Fair Regroup" title="Best place to regroup" />
          <ul className="grid gap-2">
            {intel.regroupSuggestions.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-2 text-sm">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-amber-300" />
                    <span className="truncate font-medium">{s.name}</span>
                  </span>
                  <span className="ml-6 text-xs text-muted-foreground">Everyone there within {formatDuration(s.maxEtaSeconds)}</span>
                </span>
                {canCommand ? (
                  <Button size="sm" variant="outline" onClick={() => onSetRegroup({ name: s.name, lat: s.position.lat, lng: s.position.lng })}>
                    Set
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle eyebrow="Dead-Zone Forecast" title="Signal ahead" right={intel.deadZones.length ? <SignalZero className="h-4 w-4 text-rose-300" /> : <RadioTower className="h-4 w-4 text-primary" />} />
        {intel.deadZones.length ? (
          <ul className="grid gap-1.5 text-sm">
            {intel.deadZones.map((z, i) => (
              <li key={i}>
                Signal usually drops in <span className="font-medium">{formatDistance(z.distanceAheadMeters)}</span> for about {formatDistance(z.lengthMeters)}. Regroup before it.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No known dead zones in the next 40 km. Coverage is learned from every convoy's ping gaps.</p>
        )}
      </Card>

      <Card>
        <CardTitle eyebrow="Formation" title="Front to back" right={<Rows3 className="h-4 w-4 text-muted-foreground" />} />
        <ol className="grid gap-1 text-sm">
          {intel.formation.entries.map((e) => (
            <li key={e.vehicleId} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 text-right tabular-nums text-muted-foreground">{e.order}</span>
                <span className={cn("truncate", e.stale && "text-muted-foreground line-through")}>{e.displayName}</span>
                {e.offRoute ? <Badge variant="amber">off route</Badge> : null}
                {e.stale ? <Badge variant="neutral">no signal</Badge> : null}
              </span>
              <span className="tabular-nums text-muted-foreground">{e.gapAheadMeters === null ? "lead" : `+${formatDistance(e.gapAheadMeters)}`}</span>
            </li>
          ))}
        </ol>
      </Card>

      {intel.notes.map((n) => (
        <Notice key={n} tone="info">
          <span className="flex items-start gap-2">
            <BatteryWarning className="mt-0.5 h-4 w-4 shrink-0" />
            {n}
          </span>
        </Notice>
      ))}
    </div>
  );
}
