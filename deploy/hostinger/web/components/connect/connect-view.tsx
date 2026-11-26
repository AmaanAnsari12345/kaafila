"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Check, Link2, MonitorSmartphone, Plug, Smartphone, Tablet, Trash2, X } from "lucide-react";
import { CAPABILITY_INFO, CONNECT_GUIDES, DEVICE_KINDS, type Capability } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInterval, useLoad } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";

function detectCapabilities(): Record<Capability, boolean> {
  const n: object = navigator;
  const w: object = window;
  return {
    geolocation: "geolocation" in n,
    wakeLock: "wakeLock" in n,
    bluetooth: "bluetooth" in n,
    deviceMotion: "DeviceMotionEvent" in w,
    vibration: "vibrate" in n,
    share: "share" in n,
    speechSynthesis: "speechSynthesis" in w,
    speechRecognition: "SpeechRecognition" in w || "webkitSpeechRecognition" in w,
    notifications: "Notification" in w,
    nfc: "NDEFReader" in w
  };
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/iPhone|Android.*Mobile/i.test(ua)) return "Phone";
  if (/Android/i.test(ua)) return "Android tablet";
  return "Browser";
}

interface Device {
  id: string;
  name: string;
  kind: string;
  platform: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  vehicle: { id: string; name: string } | null;
}

export function ConnectView() {
  const { me, status } = useAuth();
  const params = useSearchParams();
  const { notify, view } = useToast();
  const [caps, setCaps] = useState<Record<Capability, boolean> | null>(null);
  const devices = useLoad<Device[]>(status === "signed_in" ? () => api.get("/devices") : null, [status]);

  useEffect(() => setCaps(detectCapabilities()), []);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Connect"
        title="Devices & connectivity"
        description="Pair a dash tablet or passenger phone as a co-pilot, connect an OBD-II adapter, and check what this browser can do."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {status === "signed_in" && me ? <PairCard vehicles={me.vehicles} notify={notify} /> : <Card><p className="text-sm text-muted-foreground">Sign in to pair devices.</p></Card>}
        {status === "signed_in" ? <ClaimCard initialCode={params.get("code") ?? ""} notify={notify} onClaimed={devices.reload} /> : null}
      </div>

      <Card>
        <CardTitle eyebrow="This browser" title="Capability check" right={<MonitorSmartphone className="h-4 w-4 text-muted-foreground" />} />
        {caps ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(CAPABILITY_INFO) as Capability[]).map((c) => (
              <li key={c} className="flex items-start gap-3 rounded-lg bg-white/[0.04] p-3 text-sm">
                {caps[c] ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />}
                <span>
                  <span className="font-medium">{CAPABILITY_INFO[c].label}</span>
                  <span className="block text-xs text-muted-foreground">{CAPABILITY_INFO[c].why}</span>
                  <span className="block text-xs text-muted-foreground/80">{CAPABILITY_INFO[c].limits}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {status === "signed_in" ? (
        <Card>
          <CardTitle eyebrow="Paired" title="My devices" />
          {devices.data?.length === 0 ? <Empty>No paired devices yet.</Empty> : null}
          <ul className="grid gap-2">
            {devices.data?.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-3 text-sm">
                <span className="flex items-center gap-3">
                  {d.kind === "tablet" ? <Tablet className="h-4 w-4" /> : d.kind === "obd_adapter" ? <Plug className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  <span>
                    <span className="font-medium">{d.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {DEVICE_KINDS.find((k) => k.id === d.kind)?.label} {d.vehicle ? `· co-pilot for ${d.vehicle.name}` : ""} · paired {timeAgo(d.pairedAt)}
                    </span>
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await api.del(`/devices/${d.id}`).catch((e) => notify("Couldn't remove", errorMessage(e)));
                    devices.reload();
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Guide title="Install KAAFILA on your phone" steps={CONNECT_GUIDES.install_app} />
        <Guide title="Co-pilot: pair a tablet or passenger phone" steps={CONNECT_GUIDES.co_pilot} />
        <Guide title="Connect an OBD-II adapter" steps={CONNECT_GUIDES.obd} />
        <Guide title="Mount and power your cockpit" steps={CONNECT_GUIDES.phone_mount} />
      </div>

      <Card>
        <CardTitle eyebrow="Honest limits" title="What works where" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Android Chrome</th>
                <th className="py-2 pr-3">Desktop Chrome/Edge</th>
                <th className="py-2 pr-3">iPhone Safari</th>
                <th className="py-2">Firefox</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ["GPS while app is open", "Yes", "Yes", "Yes", "Yes"],
                ["GPS in the background", "Native app (roadmap)", "No", "Native app (roadmap)", "No"],
                ["OBD over Bluetooth", "Yes", "Yes", "No", "No"],
                ["Keep screen on", "Yes", "Yes", "Yes (16.4+)", "Recent versions"],
                ["Push notifications", "Yes", "Yes", "Installed app, 16.4+", "Yes"],
                ["Android Auto / CarPlay", "Native app (roadmap)", "—", "Native app (roadmap)", "—"]
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i} className={cn("py-2 pr-3", i === 0 && "font-medium")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {view}
    </div>
  );
}

function Guide({ title, steps }: { title: string; steps: { title: string; detail: string }[] }) {
  return (
    <Card>
      <CardTitle title={title} />
      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{i + 1}</span>
            <span>
              <span className="font-medium">{s.title}</span>
              <span className="block text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function PairCard({ vehicles, notify }: { vehicles: { id: string; name: string }[]; notify: (t: string, m?: string) => void }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [kind, setKind] = useState("tablet");
  const [pairing, setPairing] = useState<{ code: string; url: string; expiresAtIso: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  useInterval(() => pairing && setLeft(Math.max(0, Math.round((Date.parse(pairing.expiresAtIso) - Date.now()) / 1000))), pairing ? 1000 : null);

  const create = async () => {
    try {
      const p = await api.post<{ code: string; url: string; expiresAtIso: string }>("/devices/pairings", { vehicleId: vehicleId || undefined, kind });
      setPairing(p);
      setQr(await QRCode.toDataURL(p.url, { margin: 1, width: 220 }));
      setLeft(Math.round((Date.parse(p.expiresAtIso) - Date.now()) / 1000));
    } catch (err) {
      notify("Couldn't create code", errorMessage(err));
    }
  };

  return (
    <Card>
      <CardTitle eyebrow="Step 1 — on this device" title="Pair a co-pilot device" right={<Link2 className="h-4 w-4 text-muted-foreground" />} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="For car">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">No specific car</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Device type">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {DEVICE_KINDS.filter((k) => k.id !== "obd_adapter" && k.id !== "wearable").map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button className="mt-3" onClick={create}>
        Generate pairing code
      </Button>
      {pairing && left > 0 ? (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[160px_1fr]">
          {qr ? <img src={qr} alt="Pairing QR code" className="w-40 rounded-lg bg-white p-2" /> : null}
          <div>
            <p className="font-mono text-4xl font-semibold tracking-[0.3em]">{pairing.code}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}. Enter it on the other device, or scan the QR.
            </p>
          </div>
        </div>
      ) : pairing ? (
        <Notice tone="warn" className="mt-3">Code expired. Generate a new one.</Notice>
      ) : null}
    </Card>
  );
}

function ClaimCard({ initialCode, notify, onClaimed }: { initialCode: string; notify: (t: string, m?: string) => void; onClaimed: () => void }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(deviceName()), []);
  const claim = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ joinedConvoyIds: string[] }>("/devices/pairings/claim", { code, name: name || "Device", platform: navigator.platform, capabilities: detectCapabilities() });
      notify("Paired", res.joinedConvoyIds.length ? `Joined ${res.joinedConvoyIds.length} live convoy(s) as co-pilot. Open Drive.` : "This device is linked.");
      setCode("");
      onClaimed();
    } catch (err) {
      notify("Pairing failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardTitle eyebrow="Step 2 — on the other device" title="Enter a pairing code" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="6-digit code">
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="font-mono text-lg tracking-[0.3em]" placeholder="000000" />
        </Field>
        <Field label="Name this device">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
      </div>
      <Button className="mt-3" onClick={claim} disabled={busy || code.length !== 6}>
        {busy ? "Pairing…" : "Pair this device"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        <Badge variant="neutral">Tip</Badge> Signed in as a different person (a passenger)? You'll join the car's live convoys as its navigator.
      </p>
    </Card>
  );
}
