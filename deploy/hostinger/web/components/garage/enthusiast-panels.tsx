"use client";

import { useState } from "react";
import { Fuel, Trash2, Wrench } from "lucide-react";
import { MOD_CATEGORIES, MOD_CATEGORY_LABEL, type FuelEconomyReport, type ModCategory } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { cn, formatDateTime, inr } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select } from "@/components/ui/field";

type Notify = (t: string, m?: string) => void;

interface FuelData {
  unit: string;
  economyUnit: string;
  entries: { id: string; filledAt: string; odometerKm: number; quantity: number; totalCostMinor: number; isFullTank: boolean; station: string | null }[];
  economy: FuelEconomyReport;
}

export function FuelPanel({ vehicleId, odometerKm, notify }: { vehicleId: string; odometerKm: number | null; notify: Notify }) {
  const data = useLoad<FuelData>(() => api.get(`/garage/vehicles/${vehicleId}/fuel`), [vehicleId]);
  const [odo, setOdo] = useState(odometerKm ? String(odometerKm) : "");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [full, setFull] = useState(true);
  const [station, setStation] = useState("");

  const add = async () => {
    try {
      await api.post(`/garage/vehicles/${vehicleId}/fuel`, {
        filledAt: new Date().toISOString(),
        odometerKm: Number(odo),
        quantity: Number(qty),
        totalCostMinor: Math.round(Number(cost) * 100),
        isFullTank: full,
        station: station || undefined
      });
      setQty("");
      setCost("");
      data.reload();
      notify("Fill-up logged");
    } catch (err) {
      notify("Couldn't log fill-up", errorMessage(err));
    }
  };

  const e = data.data?.economy;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Average" value={e?.averageEconomy ? `${e.averageEconomy} ${data.data?.economyUnit}` : "—"} accent />
        <Stat label="Best" value={e?.bestEconomy ? `${e.bestEconomy} ${data.data?.economyUnit}` : "—"} />
        <Stat label="Cost per km" value={e?.costPerKmMinor ? inr(e.costPerKmMinor) : "—"} />
        <Stat label="Total spend" value={e ? inr(e.totalSpendMinor) : "—"} />
      </div>
      <Card>
        <CardTitle eyebrow="Fuel log" title="Log a fill-up" right={<Fuel className="h-4 w-4 text-primary" />} />
        <div className="grid gap-2 sm:grid-cols-5">
          <Field label="Odometer (km)">
            <Input inputMode="numeric" value={odo} onChange={(ev) => setOdo(ev.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={`Quantity (${data.data?.unit ?? "L"})`}>
            <Input inputMode="decimal" value={qty} onChange={(ev) => setQty(ev.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Total paid (₹)">
            <Input inputMode="decimal" value={cost} onChange={(ev) => setCost(ev.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Station (optional)">
            <Input value={station} onChange={(ev) => setStation(ev.target.value)} maxLength={120} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={full} onChange={(ev) => setFull(ev.target.checked)} className="accent-cyan-400" /> Filled to full
          </label>
        </div>
        <Button className="mt-3" onClick={add} disabled={!odo || !qty || !cost}>
          Log fill-up
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Mileage is measured between two full-tank fills, counting any partial top-ups in between — the most accurate method.</p>
      </Card>
      <Card>
        <CardTitle title="History" />
        {data.data?.entries.length === 0 ? <Empty>No fill-ups yet.</Empty> : null}
        <ul className="grid gap-1.5 text-sm">
          {data.data?.entries.map((f) => {
            const interval = e?.intervals.find((i) => i.toId === f.id);
            return (
              <li key={f.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-2">
                <span>
                  <span className="font-medium tabular-nums">{f.odometerKm.toLocaleString("en-IN")} km</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(f.filledAt)} · {f.quantity} {data.data?.unit} {f.isFullTank ? "· full" : "· top-up"} {f.station ? `· ${f.station}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {interval ? <Badge>{interval.economy} {data.data?.economyUnit}</Badge> : null}
                  <span className="tabular-nums">{inr(f.totalCostMinor)}</span>
                  <button type="button" aria-label="Delete fill-up" className="text-muted-foreground hover:text-rose-300" onClick={() => api.del(`/garage/vehicles/${vehicleId}/fuel/${f.id}`).then(data.reload)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

interface Mod {
  id: string;
  category: ModCategory;
  name: string;
  brand: string | null;
  installedAt: string | null;
  costMinor: number | null;
  notes: string | null;
}

export function BuildSheetPanel({ vehicleId, notify }: { vehicleId: string; notify: Notify }) {
  const mods = useLoad<Mod[]>(() => api.get(`/garage/vehicles/${vehicleId}/mods`), [vehicleId]);
  const [category, setCategory] = useState<ModCategory>("wheels");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [cost, setCost] = useState("");

  const add = async () => {
    try {
      await api.post(`/garage/vehicles/${vehicleId}/mods`, { category, name, brand: brand || undefined, costMinor: cost ? Math.round(Number(cost) * 100) : undefined });
      setName("");
      setBrand("");
      setCost("");
      mods.reload();
    } catch (err) {
      notify("Couldn't add part", errorMessage(err));
    }
  };

  const grouped = MOD_CATEGORIES.map((c) => ({ c, items: (mods.data ?? []).filter((m) => m.category === c) })).filter((g) => g.items.length);
  const total = (mods.data ?? []).reduce((s, m) => s + (m.costMinor ?? 0), 0);

  return (
    <Card>
      <CardTitle eyebrow="Build sheet" title={`${mods.data?.length ?? 0} parts${total ? ` · ${inr(total)} invested` : ""}`} right={<Wrench className="h-4 w-4 text-primary" />} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ModCategory)}>
            {MOD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MOD_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Part">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="18-inch forged alloys" maxLength={120} />
        </Field>
        <Field label="Brand">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Cost (₹, optional)">
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
      </div>
      <Button className="mt-3" onClick={add} disabled={!name.trim()}>
        Add to build
      </Button>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {grouped.length === 0 ? <Empty>Stock for now. Add your first mod.</Empty> : null}
        {grouped.map((g) => (
          <div key={g.c} className="rounded-lg border border-white/10 p-3">
            <p className="hud-label">{MOD_CATEGORY_LABEL[g.c]}</p>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {g.items.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span>
                    {m.name}
                    {m.brand ? <span className="text-muted-foreground"> · {m.brand}</span> : null}
                  </span>
                  <button type="button" aria-label={`Remove ${m.name}`} className="text-muted-foreground hover:text-rose-300" onClick={() => api.del(`/garage/vehicles/${vehicleId}/mods/${m.id}`).then(mods.reload)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Turn on “showcase” for this car to show the build on your public profile. Check that modifications are legal where you drive.</p>
    </Card>
  );
}

interface Score {
  days: number;
  samples: number;
  score: number | null;
  distanceKm: number;
  harshBrakes: number;
  harshAccels: number;
  eventsPer100Km: number | null;
  maxSpeedKph: number;
  rating: "smooth" | "good" | "needs_attention" | "not_enough_data";
}

export function DriveScorePanel({ vehicleId }: { vehicleId: string }) {
  const [days, setDays] = useState(30);
  const score = useLoad<Score>(() => api.get(`/garage/vehicles/${vehicleId}/drive-score?days=${days}`), [vehicleId, days]);
  const s = score.data;
  const value = s?.score ?? 0;
  const circumference = 2 * Math.PI * 54;
  return (
    <Card className="hud-corners">
      <CardTitle
        eyebrow="Smooth-driving score"
        title="How smoothly this car is driven"
        right={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 w-28 text-xs" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        }
      />
      {score.error ? <Notice tone="danger">{score.error}</Notice> : null}
      <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
        <svg viewBox="0 0 140 140" className="mx-auto w-44" role="img" aria-label={s?.score !== null && s?.score !== undefined ? `Score ${s.score} out of 100` : "Not enough data"}>
          <defs>
            <linearGradient id="score-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="url(#score-grad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)", filter: "drop-shadow(0 0 6px rgba(34,211,238,.6))" }}
          />
          <text x="70" y="68" textAnchor="middle" className="fill-white font-display" fontSize="34" fontWeight="700">
            {s?.score ?? "—"}
          </text>
          <text x="70" y="90" textAnchor="middle" fill="rgba(165,243,252,.7)" fontSize="10" letterSpacing="2">
            {s?.rating === "not_enough_data" ? "NEED 5 KM+" : (s?.rating ?? "").replace("_", " ").toUpperCase()}
          </text>
        </svg>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Distance" value={s ? `${s.distanceKm} km` : "—"} />
          <Stat label="Harsh braking" value={s ? String(s.harshBrakes) : "—"} />
          <Stat label="Harsh acceleration" value={s ? String(s.harshAccels) : "—"} />
          <Stat label="Events / 100 km" value={s?.eventsPer100Km !== null && s?.eventsPer100Km !== undefined ? String(s.eventsPer100Km) : "—"} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Estimated from this car's convoy GPS data ({s?.samples ?? 0} samples). Phone GPS misses very short events, so use it as coaching, not a verdict.</p>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", accent ? "border-cyan-300/30 bg-cyan-300/5" : "border-white/10 bg-white/[0.03]")}>
      <p className="hud-label">{label}</p>
      <p className={cn("font-display mt-1 text-lg font-semibold tabular-nums", accent && "text-cyan-100")}>{value}</p>
    </div>
  );
}

