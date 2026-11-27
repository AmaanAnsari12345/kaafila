"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bluetooth, CarFront, CheckCircle2, ClipboardCheck, FileText, Gauge, Plus, Trash2, Wrench } from "lucide-react";
import { DOCUMENT_KINDS, interpretObd, OBD_PIDS, PRE_TRIP_CHECKLIST, REMINDER_TYPES, type ObdMetric } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { bluetoothSupported, ElmBleClient } from "@/lib/obd-ble";
import type { GarageVehicle } from "@/lib/types";
import { cn, formatDateTime, inr } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select, Tabs, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { BuildSheetPanel, DriveScorePanel, FuelPanel } from "./enthusiast-panels";

interface VehicleDetail {
  vehicle: GarageVehicle;
  plan: string;
  spendMinor: number;
  maintenance: { id: string; type: string; title: string; odometerKm: number | null; costMinor: number | null; vendor: string | null; notes: string | null; performedAt: string }[];
  reminders: { id: string; type: string; title: string; dueAt: string | null; dueOdometerKm: number | null; intervalDays: number | null; intervalKm: number | null; status: { state: string; label: string } }[];
  documents: { id: string; kind: string; number: string | null; issuer: string | null; expiresAt: string | null; status: { state: string; daysLeft: number | null } }[];
  lastTelemetry: { readings: Partial<Record<ObdMetric, number>>; dtcs: string[]; capturedAt: string; flags: { level: string; message: string }[] } | null;
}

type DetailTab = "reminders" | "documents" | "log" | "fuel" | "build" | "score" | "obd" | "checklist";

export function GarageView() {
  const { status, refreshMe } = useAuth();
  const { notify, view } = useToast();
  const list = useLoad<GarageVehicle[]>(status === "signed_in" ? () => api.get("/garage/vehicles") : null, [status]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selectedId = selected ?? list.data?.[0]?.id ?? null;

  if (status === "signed_out") return <SignInPrompt what="manage your garage" />;

  return (
    <div>
      <PageHeader
        eyebrow="Garage"
        title="Car care"
        description="Service reminders by date and odometer, document expiry alerts, a pre-trip checklist and live OBD-II diagnostics."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add car
          </Button>
        }
      />
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          {list.data?.length === 0 ? <Empty>No cars yet. Add your first car to join convoys as a driver.</Empty> : null}
          {list.data?.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelected(v.id)}
              className={cn("glass-panel rounded-lg p-3 text-left transition hover:border-primary/40", selectedId === v.id && "border-primary/60 shadow-glow")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <CarFront className="h-4 w-4 text-primary" />
                    <span className="truncate">{v.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{[v.make, v.model, v.year].filter(Boolean).join(" ") || v.type}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={v.plan === "explorer" ? "neutral" : "default"}>{v.plan === "explorer" ? "Explorer" : "Drive"}</Badge>
                  {v.attention ? <Badge variant="amber">{v.attention} due</Badge> : null}
                </div>
              </div>
            </button>
          ))}
          <Link href="/billing" className="text-center text-xs text-muted-foreground underline">
            Upgrade a car to Drive — ₹500 per car per month
          </Link>
        </div>
        <div className="min-w-0">{selectedId ? <VehiclePanel key={selectedId} id={selectedId} notify={notify} onChanged={() => (list.reload(), refreshMe())} /> : null}</div>
      </div>
      <AddVehicleDialog open={adding} onClose={() => setAdding(false)} onCreated={(id) => (list.reload(), void refreshMe(), setSelected(id))} />
      {view}
    </div>
  );
}

function VehiclePanel({ id, notify, onChanged }: { id: string; notify: (t: string, m?: string) => void; onChanged: () => void }) {
  const detail = useLoad<VehicleDetail>(() => api.get(`/garage/vehicles/${id}`), [id]);
  const [tab, setTab] = useState<DetailTab>("reminders");
  if (detail.error) return <Notice tone="danger">{detail.error}</Notice>;
  if (!detail.data) return <Card><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  const d = detail.data;
  const v = d.vehicle;

  const remove = async () => {
    if (!window.confirm(`Delete ${v.name} and its service history? This cannot be undone.`)) return;
    try {
      await api.del(`/garage/vehicles/${id}`);
      notify("Car deleted");
      onChanged();
    } catch (err) {
      notify("Couldn't delete", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{v.name}</h2>
            <p className="text-sm text-muted-foreground">
              {[v.make, v.model, v.year, v.fuelType].filter(Boolean).join(" · ")} {v.plateNumber ? `· ${v.plateNumber}` : ""}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Metric label="Odometer" value={v.odometerKm ? `${v.odometerKm.toLocaleString("en-IN")} km` : "—"} />
          <Metric label="Full-tank range" value={v.rangeKmFull ? `${v.rangeKmFull} km` : "add for range planning"} />
          <Metric label="Service spend" value={inr(d.spendMinor)} />
          <Metric label="Plan" value={d.plan === "explorer" ? "Explorer (free)" : "Drive"} />
        </div>
      </Card>
      <Tabs<DetailTab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "reminders", label: "Reminders", badge: d.reminders.filter((r) => r.status.state !== "ok").length || undefined },
          { id: "documents", label: "Documents", badge: d.documents.filter((x) => x.status.state === "expired" || x.status.state === "expiring").length || undefined },
          { id: "log", label: "Service log" },
          { id: "fuel", label: "Fuel" },
          { id: "build", label: "Build" },
          { id: "score", label: "Drive score" },
          { id: "obd", label: "OBD-II" },
          { id: "checklist", label: "Pre-trip" }
        ]}
      />
      {tab === "reminders" ? <Reminders d={d} id={id} notify={notify} reload={detail.reload} /> : null}
      {tab === "documents" ? <Documents d={d} id={id} notify={notify} reload={detail.reload} /> : null}
      {tab === "log" ? <ServiceLog d={d} id={id} notify={notify} reload={detail.reload} /> : null}
      {tab === "fuel" ? <FuelPanel vehicleId={id} odometerKm={v.odometerKm} notify={notify} /> : null}
      {tab === "build" ? <BuildSheetPanel vehicleId={id} notify={notify} /> : null}
      {tab === "score" ? <DriveScorePanel vehicleId={id} /> : null}
      {tab === "obd" ? <ObdPanel id={id} plan={d.plan} last={d.lastTelemetry} notify={notify} /> : null}
      {tab === "checklist" ? <Checklist vehicleId={id} /> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Reminders({ d, id, notify, reload }: { d: VehicleDetail; id: string; notify: (t: string, m?: string) => void; reload: () => void }) {
  const [type, setType] = useState("general_service");
  const [dueAt, setDueAt] = useState("");
  const [dueKm, setDueKm] = useState("");
  const [intervalDays, setIntervalDays] = useState("365");
  const [intervalKm, setIntervalKm] = useState("10000");

  const add = async () => {
    try {
      await api.post(`/garage/vehicles/${id}/reminders`, {
        type,
        title: REMINDER_TYPES.find((r) => r.id === type)?.label ?? "Service",
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        dueOdometerKm: dueKm ? Number(dueKm) : undefined,
        intervalDays: intervalDays ? Number(intervalDays) : undefined,
        intervalKm: intervalKm ? Number(intervalKm) : undefined
      });
      notify("Reminder added");
      reload();
    } catch (err) {
      notify("Couldn't add reminder", errorMessage(err));
    }
  };
  const done = async (r: VehicleDetail["reminders"][number]) => {
    const km = window.prompt("Odometer reading now (km)? Leave blank if unknown.", d.vehicle.odometerKm?.toString() ?? "");
    try {
      await api.post(`/garage/vehicles/${id}/maintenance`, { type: r.type, title: r.title, performedAt: new Date().toISOString(), odometerKm: km ? Number(km) : undefined, reminderId: r.id });
      notify("Logged and rescheduled", "The next due date moved forward by its interval.");
      reload();
    } catch (err) {
      notify("Couldn't log service", errorMessage(err));
    }
  };

  return (
    <Card>
      <CardTitle eyebrow="Reminders" title="What's due" />
      <ul className="grid gap-2">
        {d.reminders.length === 0 ? <Empty>No reminders. Intervals are in your owner's manual.</Empty> : null}
        {d.reminders.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-3 text-sm">
            <span>
              <span className="font-medium">{r.title}</span>
              <span className="block text-xs text-muted-foreground">{r.status.label}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={r.status.state === "overdue" ? "danger" : r.status.state === "due_soon" ? "amber" : "default"}>{r.status.state.replace("_", " ")}</Badge>
              <Button size="sm" variant="outline" onClick={() => done(r)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </Button>
              <button type="button" aria-label="Delete reminder" className="text-muted-foreground hover:text-rose-300" onClick={() => api.del(`/garage/vehicles/${id}/reminders/${r.id}`).then(reload)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {REMINDER_TYPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Due at odometer (km)">
          <Input inputMode="numeric" value={dueKm} onChange={(e) => setDueKm(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Repeat every (days)">
          <Input inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Repeat every (km)">
          <Input inputMode="numeric" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="flex items-end">
          <Button className="w-full" onClick={add} disabled={!dueAt && !dueKm}>
            <Plus className="h-4 w-4" /> Add reminder
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Documents({ d, id, notify, reload }: { d: VehicleDetail; id: string; notify: (t: string, m?: string) => void; reload: () => void }) {
  const [kind, setKind] = useState("insurance");
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const add = async () => {
    try {
      await api.post(`/garage/vehicles/${id}/documents`, { kind, number: number || undefined, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined });
      setNumber("");
      setExpiresAt("");
      notify("Document saved");
      reload();
    } catch (err) {
      notify("Couldn't save", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle eyebrow="Document vault" title="Expiry tracking" right={<FileText className="h-4 w-4 text-muted-foreground" />} />
      <ul className="grid gap-2">
        {d.documents.length === 0 ? <Empty>Add insurance, registration, pollution certificate and FASTag to get expiry alerts.</Empty> : null}
        {d.documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-3 text-sm">
            <span>
              <span className="font-medium">{DOCUMENT_KINDS.find((k) => k.id === doc.kind)?.label ?? doc.kind}</span>
              <span className="block text-xs text-muted-foreground">
                {doc.number ? `${doc.number} · ` : ""}
                {doc.expiresAt ? `expires ${new Date(doc.expiresAt).toLocaleDateString()}` : "no expiry set"}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={doc.status.state === "expired" ? "danger" : doc.status.state === "expiring" ? "amber" : doc.status.state === "ok" ? "default" : "neutral"}>
                {doc.status.state === "expiring" ? `${doc.status.daysLeft} days left` : doc.status.state}
              </Badge>
              <button type="button" aria-label="Delete document" className="text-muted-foreground hover:text-rose-300" onClick={() => api.del(`/garage/vehicles/${id}/documents/${doc.id}`).then(reload)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Field label="Document">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Number (optional)">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Expires on">
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button className="w-full" onClick={add}>
            Save
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Store numbers and dates only. Keep originals as your local law requires.</p>
    </Card>
  );
}

function ServiceLog({ d, id, notify, reload }: { d: VehicleDetail; id: string; notify: (t: string, m?: string) => void; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [km, setKm] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const add = async () => {
    try {
      await api.post(`/garage/vehicles/${id}/maintenance`, {
        type: "custom",
        title: title.trim(),
        performedAt: new Date().toISOString(),
        costMinor: cost ? Math.round(Number(cost) * 100) : undefined,
        odometerKm: km ? Number(km) : undefined,
        vendor: vendor || undefined,
        notes: notes || undefined
      });
      setTitle("");
      setCost("");
      setNotes("");
      notify("Service logged");
      reload();
    } catch (err) {
      notify("Couldn't log", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle eyebrow="Service log" title="History" right={<Wrench className="h-4 w-4 text-muted-foreground" />} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Work done" className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oil and filter change" maxLength={120} />
        </Field>
        <Field label="Cost (₹)">
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <Field label="Odometer (km)">
          <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Workshop" className="sm:col-span-2">
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="min-h-10" />
        </Field>
      </div>
      <Button className="mt-3" onClick={add} disabled={!title.trim()}>
        <Plus className="h-4 w-4" /> Log service
      </Button>
      <ul className="mt-4 grid gap-1.5 text-sm">
        {d.maintenance.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-2">
            <span>
              <span className="font-medium">{m.title}</span>
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(m.performedAt)}
                {m.odometerKm ? ` · ${m.odometerKm.toLocaleString("en-IN")} km` : ""}
                {m.vendor ? ` · ${m.vendor}` : ""}
              </span>
            </span>
            <span className="tabular-nums">{m.costMinor ? inr(m.costMinor) : ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ObdPanel({ id, plan, last, notify }: { id: string; plan: string; last: VehicleDetail["lastTelemetry"]; notify: (t: string, m?: string) => void }) {
  const [client, setClient] = useState<ElmBleClient | null>(null);
  const [readings, setReadings] = useState<Partial<Record<ObdMetric, number>>>(last?.readings ?? {});
  const [dtcs, setDtcs] = useState<string[]>(last?.dtcs ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const supported = typeof window !== "undefined" && bluetoothSupported();

  useEffect(() => () => client?.disconnect(), [client]);

  useEffect(() => {
    if (!client || !polling) return;
    let stop = false;
    const loop = async () => {
      while (!stop) {
        try {
          const r = await client.readAll();
          setReadings(r);
          await api.post(`/garage/vehicles/${id}/telemetry`, { readings: r, dtcs }).catch(() => undefined);
        } catch (err) {
          setError(errorMessage(err));
          break;
        }
        await new Promise((res) => setTimeout(res, 5000));
      }
    };
    void loop();
    return () => {
      stop = true;
    };
  }, [client, polling, id, dtcs]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await ElmBleClient.connect();
      await c.init();
      setClient(c);
      setReadings(await c.readAll());
      setDtcs(await c.readDtcs().catch(() => []));
      notify("OBD adapter connected", `${c.deviceName} (${c.profile})`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const flags = interpretObd(readings, dtcs);
  return (
    <Card>
      <CardTitle eyebrow="OBD-II diagnostics" title={client ? `Connected: ${client.deviceName}` : "Live engine data"} right={<Gauge className="h-4 w-4 text-muted-foreground" />} />
      {!supported ? (
        <Notice tone="warn">
          Web Bluetooth isn't available in this browser. Use Chrome or Edge on Android, Windows, macOS or ChromeOS. iPhone browsers don't support it. <Link href="/connect" className="underline">Setup guide</Link>
        </Notice>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {client ? (
          <>
            <Button variant={polling ? "secondary" : "default"} onClick={() => setPolling((p) => !p)}>
              {polling ? "Stop live updates" : "Start live updates (5 s)"}
            </Button>
            <Button variant="outline" onClick={async () => setDtcs(await client.readDtcs().catch(() => []))}>
              Read fault codes
            </Button>
            <Button variant="ghost" onClick={() => (client.disconnect(), setClient(null), setPolling(false))}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button onClick={connect} disabled={!supported || busy}>
            <Bluetooth className="h-4 w-4" /> {busy ? "Connecting…" : "Connect OBD adapter"}
          </Button>
        )}
      </div>
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OBD_PIDS.map((p) => (
          <div key={p.pid} className="rounded-lg bg-white/[0.04] p-3">
            <p className="text-xs text-muted-foreground">{p.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {readings[p.metric] !== undefined ? `${readings[p.metric]} ${p.unit}` : "—"}
            </p>
          </div>
        ))}
      </div>
      {flags.length ? (
        <div className="mt-3 grid gap-2">
          {flags.map((f, i) => (
            <Notice key={i} tone={f.level === "alert" ? "danger" : "warn"}>
              {f.message}
            </Notice>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {plan === "explorer" ? "Explorer shows live readings only. Drive keeps telemetry history." : "Readings are saved to this car's history every 15 seconds while live."}{" "}
        {last ? `Last saved ${formatDateTime(last.capturedAt)}.` : ""}
      </p>
    </Card>
  );
}

function Checklist({ vehicleId }: { vehicleId: string }) {
  const key = `kaafila.checklist.${vehicleId}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      setDone([]);
    }
  }, [key]);
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((d) => d !== id) : [...done, id];
    setDone(next);
    window.localStorage.setItem(key, JSON.stringify(next));
  };
  const groups = [...new Set(PRE_TRIP_CHECKLIST.map((c) => c.group))];
  return (
    <Card>
      <CardTitle eyebrow="Before you roll" title={`Pre-trip checklist · ${done.length}/${PRE_TRIP_CHECKLIST.length}`} right={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />} />
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{g}</p>
            <ul className="grid gap-1.5">
              {PRE_TRIP_CHECKLIST.filter((c) => c.group === g).map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={done.includes(c.id)} onChange={() => toggle(c.id)} className="mt-1 accent-teal-400" />
                    <span className={cn(done.includes(c.id) && "text-muted-foreground line-through")}>{c.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-3" onClick={() => (setDone([]), window.localStorage.removeItem(key))}>
        Reset for next trip
      </Button>
    </Card>
  );
}

function AddVehicleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", type: "car", make: "", model: "", year: "", plateNumber: "", fuelType: "petrol", rangeKmFull: "", odometerKm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await api.post<{ id: string }>("/garage/vehicles", {
        name: form.name.trim() || [form.make, form.model].filter(Boolean).join(" ") || "My car",
        type: form.type,
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year ? Number(form.year) : undefined,
        plateNumber: form.plateNumber || undefined,
        fuelType: form.fuelType,
        rangeKmFull: form.rangeKmFull ? Number(form.rangeKmFull) : undefined,
        odometerKm: form.odometerKm ? Number(form.odometerKm) : undefined
      });
      onCreated(v.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a car" description="Full-tank range lets the convoy plan fuel stops around the car with the least range.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nickname">
          <Input value={form.name} onChange={set("name")} placeholder="The white Innova" maxLength={60} />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={set("type")}>
            {["car", "suv", "supercar", "ev", "motorcycle", "bus", "truck", "support"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Make">
          <Input value={form.make} onChange={set("make")} maxLength={40} />
        </Field>
        <Field label="Model">
          <Input value={form.model} onChange={set("model")} maxLength={40} />
        </Field>
        <Field label="Year">
          <Input inputMode="numeric" value={form.year} onChange={set("year")} maxLength={4} />
        </Field>
        <Field label="Registration number">
          <Input value={form.plateNumber} onChange={set("plateNumber")} maxLength={16} className="uppercase" />
        </Field>
        <Field label="Fuel">
          <Select value={form.fuelType} onChange={set("fuelType")}>
            {["petrol", "diesel", "cng", "lpg", "ev", "hybrid"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Range on a full tank / charge (km)">
          <Input inputMode="numeric" value={form.rangeKmFull} onChange={set("rangeKmFull")} placeholder="e.g. 550" />
        </Field>
        <Field label="Odometer (km)">
          <Input inputMode="numeric" value={form.odometerKm} onChange={set("odometerKm")} />
        </Field>
      </div>
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      <Button className="mt-4 w-full" onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Add car"}
      </Button>
    </Modal>
  );
}
