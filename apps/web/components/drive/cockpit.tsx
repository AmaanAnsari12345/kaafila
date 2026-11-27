"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mic, MicOff, Pause, Play, Plus, Power, Satellite, ShieldCheck, Smartphone, Square, UserPlus } from "lucide-react";
import {
  buildRouteIndex,
  decodePolyline,
  DRIVING_ROLES,
  pointAtChainage,
  quickSignal,
  type ConvoyIntelReport,
  type GeoPoint,
  type LiveVehicleState,
  type QuickSignalCode,
  type QuickSignalEvent,
  type SosEvent
} from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEMO_CONVOY, DEMO_POLYLINE, DemoConvoy } from "@/lib/demo";
import { useCrashDetection, useGeolocation, useInterval, useLoad, useSpeech, useWakeLock } from "@/lib/hooks";
import { useConvoySocket } from "@/lib/socket";
import type { ConvoyDetail, ConvoySummary } from "@/lib/types";
import { cn, formatKph } from "@/lib/utils";
import { LiveMap } from "@/components/map/live-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Notice, Select, Tabs } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { CreateConvoyDialog, JoinConvoyDialog } from "./convoy-dialogs";
import { IntelPanel } from "./intel-panel";
import { QuickSignals } from "./quick-signals";
import { ChatPanel, KittyPanel, RosterPanel, SharePanel } from "./side-panels";
import { CockpitHud } from "./hud";
import { CrashCountdown, SosButton, SosDialog } from "./sos";

type Tab = "intel" | "members" | "chat" | "kitty" | "invite";

export function Cockpit() {
  const { me, status, token } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { notify, view: toastView } = useToast();
  const { speak, enabled: voiceOn, setEnabled: setVoiceOn } = useSpeech();

  const convoys = useLoad<ConvoySummary[]>(status === "signed_in" ? () => api.get("/convoys/mine") : null, [status]);
  const activeConvoys = (convoys.data ?? []).filter((c) => c.status !== "completed" && c.status !== "cancelled");
  const selectedId = status === "signed_in" ? (params.get("c") ?? activeConvoys[0]?.id ?? null) : null;
  const live = Boolean(selectedId);

  const [dialog, setDialog] = useState<"create" | "join" | "sos" | "regroup" | null>(params.get("join") ? "join" : null);
  const [tab, setTab] = useState<Tab>("intel");
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [crashOn, setCrashOn] = useState(false);
  const [crash, setCrash] = useState<{ peakG: number } | null>(null);
  const [regroupDraft, setRegroupDraft] = useState<GeoPoint | null>(null);
  const [emergencyNumber, setEmergencyNumber] = useState("112");

  /* ------------------------------ live data ------------------------------ */

  const detail = useLoad<ConvoyDetail>(selectedId ? () => api.get(`/convoys/${selectedId}`) : null, [selectedId]);
  const onSignal = useCallback(
    (s: QuickSignalEvent) => {
      if (s.userId === me?.id) return;
      const def = quickSignal(s.code);
      speak(`${s.displayName} ${def.spoken}`);
      notify(def.label, `${s.displayName} ${def.spoken}`);
      if (def.severity === "critical") navigator.vibrate?.([200, 100, 200]);
    },
    [me?.id, speak, notify]
  );
  const onSos = useCallback(
    (s: SosEvent) => {
      if (s.userId === me?.id) return;
      speak(`Emergency. ${s.displayName} raised an SOS.`);
      notify("SOS raised", `${s.displayName} needs help. Open the map to see where.`);
      navigator.vibrate?.([500, 200, 500, 200, 500]);
    },
    [me?.id, speak, notify]
  );
  const socket = useConvoySocket(selectedId, token, { onSignal, onSos });

  const [intel, setIntel] = useState<ConvoyIntelReport | null>(null);
  const [crumbs, setCrumbs] = useState<GeoPoint[]>([]);
  const pollIntel = useCallback(async () => {
    if (!selectedId) return;
    try {
      setIntel(await api.get<ConvoyIntelReport>(`/intel/convoys/${selectedId}`));
    } catch {
      /* keep last report */
    }
  }, [selectedId]);
  const pollCrumbs = useCallback(async () => {
    if (!selectedId) return;
    try {
      const r = await api.get<{ points: { lat: number; lng: number }[] }>(`/tracking/convoys/${selectedId}/breadcrumbs`);
      setCrumbs(r.points.map((p) => ({ lat: p.lat, lng: p.lng })));
    } catch {
      /* ignore */
    }
  }, [selectedId]);
  useEffect(() => {
    setIntel(null);
    setCrumbs([]);
    void pollIntel();
    void pollCrumbs();
  }, [pollIntel, pollCrumbs]);
  useInterval(() => void pollIntel(), live ? 10_000 : null);
  useInterval(() => void pollCrumbs(), live ? 15_000 : null);
  useInterval(() => detail.reload(), live ? 60_000 : null);

  /* ------------------------------ demo data ------------------------------ */

  const demoRef = useRef<DemoConvoy | null>(null);
  const [demoTick, setDemoTick] = useState(0);
  const [easeOffUntil, setEaseOffUntil] = useState(0);
  if (!demoRef.current) demoRef.current = new DemoConvoy();
  useInterval(
    () => {
      demoRef.current!.tick(1, Date.now() < easeOffUntil ? -14 : 0);
      setDemoTick((t) => t + 1);
    },
    live ? null : 1000
  );
  const demoVehicles = useMemo(() => (live ? [] : demoRef.current!.vehicles()), [live, demoTick]);
  const demoIntel = useMemo(() => (live || demoTick % 2 ? null : demoRef.current!.intel()), [live, demoTick]);
  const [demoIntelCached, setDemoIntelCached] = useState<ConvoyIntelReport | null>(null);
  useEffect(() => {
    if (demoIntel) setDemoIntelCached(demoIntel);
  }, [demoIntel]);
  const [demoSignals, setDemoSignals] = useState<QuickSignalEvent[]>([]);

  /* ---------------------------- derived state ---------------------------- */

  const vehicles: LiveVehicleState[] = live ? Object.values(socket.vehicles) : demoVehicles;
  const report = live ? intel : demoIntelCached;
  const polyline = live ? detail.data?.routePolyline : DEMO_POLYLINE;
  const myRole = detail.data?.me.role;
  const myVehicleId = detail.data?.me.vehicleId ?? null;
  const canCommand = live ? myRole === "owner" || myRole === "leader" : true;
  const canDrive = Boolean(live && myVehicleId && myRole && DRIVING_ROLES.includes(myRole));
  const regroup = live ? socket.regroup ?? detail.data?.regroup ?? null : null;

  const { fix, error: gpsError } = useGeolocation(sharing || crashOn);
  const wakeLock = useWakeLock(sharing);
  const moving = (fix?.speedKph ?? 0) > 10;

  // Location publishing at the car's plan cadence (server enforces it too).
  const lastSent = useRef(0);
  useEffect(() => {
    if (!sharing || !canDrive || !fix || !myVehicleId || !socket.connected) return;
    const interval = me?.plan === "explorer" ? 10_000 : 2_000;
    if (Date.now() - lastSent.current < interval) return;
    lastSent.current = Date.now();
    socket
      .sendPing({ vehicleId: myVehicleId, lat: fix.position.lat, lng: fix.position.lng, speedKph: fix.speedKph, headingDeg: fix.headingDeg, accuracyMeters: fix.accuracyMeters, capturedAt: fix.capturedAtIso })
      .catch(() => undefined);
  }, [fix, sharing, canDrive, myVehicleId, socket, me?.plan]);

  // Local emergency number, once we know where we are.
  const looked = useRef(false);
  useEffect(() => {
    if (!fix || looked.current) return;
    looked.current = true;
    api
      .get<{ numbers: { number: string }[] }>(`/roadside/emergency?lat=${fix.position.lat}&lng=${fix.position.lng}`, { auth: false })
      .then((r) => r.numbers[0] && setEmergencyNumber(r.numbers[0].number))
      .catch(() => undefined);
  }, [fix]);

  const crashDetect = useCrashDetection(crashOn, fix?.speedKph, useCallback((peakG: number) => setCrash({ peakG }), []));

  const deadZoneSegments = useMemo(() => {
    if (!report?.deadZones.length || !polyline) return [];
    const route = buildRouteIndex(decodePolyline(polyline));
    return report.deadZones.map((z) => {
      const pts: GeoPoint[] = [];
      for (let ch = z.startChainageMeters; ch <= z.endChainageMeters + 1; ch += 200) pts.push(pointAtChainage(route, ch));
      return pts;
    });
  }, [report?.deadZones, polyline]);

  const myPosition = fix?.position ?? null;

  /* ------------------------------- actions ------------------------------- */

  const sendSignal = async (code: QuickSignalCode) => {
    const def = quickSignal(code);
    if (!live) {
      const e: QuickSignalEvent = { id: `demo-${Date.now()}`, convoyId: "demo", userId: "me", displayName: "You", code, createdAtIso: new Date().toISOString() };
      setDemoSignals((s) => [e, ...s]);
      speak(`You ${def.spoken}`);
      return notify(def.label, "Demo: in a real convoy every car hears this.");
    }
    try {
      if (socket.connected) await socket.sendSignal(code, fix?.position.lat, fix?.position.lng);
      else await api.post(`/convoys/${selectedId}/signals`, { code, lat: fix?.position.lat, lng: fix?.position.lng });
      notify(def.label, "Sent to the convoy.");
    } catch (err) {
      notify("Signal not sent", errorMessage(err));
    }
  };

  const raiseSos = async (kind: SosEvent["kind"], peakG?: number) => {
    if (!live) return notify("Demo SOS", "In a real convoy, every car gets your location and safety card instantly.");
    const pos = fix?.position ?? vehicles.find((v) => v.userId === me?.id)?.position;
    if (!pos) return notify("Location needed", "Turn on location sharing so the convoy can find you. Call emergency services if you need help now.");
    try {
      if (socket.connected) await socket.raiseSos(kind, pos.lat, pos.lng, peakG);
      else await api.post("/sos", { convoyId: selectedId, kind, lat: pos.lat, lng: pos.lng, peakG });
      notify("SOS sent", "Your convoy has your location.");
    } catch (err) {
      notify("SOS failed to send", `${errorMessage(err)} — call ${emergencyNumber} if you need help.`);
    }
  };

  const setRegroup = async (s: { name: string; lat: number; lng: number }) => {
    if (!live) return notify("Demo", `Regroup set at ${s.name}. Every car would get a voice prompt.`);
    try {
      await api.post(`/convoys/${selectedId}/regroup`, s);
      notify("Regroup set", s.name);
    } catch (err) {
      notify("Couldn't set regroup", errorMessage(err));
    }
  };

  const setConvoyStatus = async (next: "active" | "paused" | "completed") => {
    try {
      await api.patch(`/convoys/${selectedId}/status`, { status: next });
      detail.reload();
      convoys.reload();
      notify(next === "completed" ? "Convoy completed" : next === "paused" ? "Convoy paused" : "Convoy started");
    } catch (err) {
      notify("Couldn't update convoy", errorMessage(err));
    }
  };

  const choose = (id: string) => router.replace(`/drive?c=${id}`);

  /* -------------------------------- render ------------------------------- */

  const title = live ? (detail.data?.name ?? activeConvoys.find((c) => c.id === selectedId)?.name ?? "Convoy") : DEMO_CONVOY.name;
  const me_ = live ? vehicles.find((v) => v.userId === me?.id) : vehicles[0];

  return (
    <div className="grid gap-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            {live ? <Badge variant={socket.connected ? "default" : "amber"}>{socket.connected ? "live" : "reconnecting"}</Badge> : <Badge variant="amber">demo</Badge>}
            {detail.data ? <Badge variant="neutral">{detail.data.status}</Badge> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {live
              ? `${detail.data?.originName ?? "Start"} → ${detail.data?.destinationName ?? "Destination"} · you are ${myRole ?? "…"}`
              : "Simulated cars running the real intelligence engine. Sign in to drive for real."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "signed_in" && activeConvoys.length > 1 ? (
            <Select value={selectedId ?? ""} onChange={(e) => choose(e.target.value)} className="h-9 w-56" aria-label="Choose convoy">
              {activeConvoys.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : null}
          {status === "signed_in" && me ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog("join")}>
                <UserPlus className="h-4 w-4" /> Join
              </Button>
              <Button size="sm" onClick={() => setDialog("create")}>
                <Plus className="h-4 w-4" /> Create
              </Button>
            </>
          ) : status === "signed_out" ? (
            <Link href="/login" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Sign in to drive
            </Link>
          ) : null}
        </div>
      </div>

      {live && socket.error ? <Notice tone="warn">Live connection: {socket.error}</Notice> : null}
      {socket.statusEvents[0]?.reason ? <Notice tone="danger">{socket.statusEvents[0].reason}</Notice> : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,0.7fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <div className="relative">
            <LiveMap
              routePolyline={polyline}
              vehicles={vehicles}
              selectedVehicleId={selectedVehicle}
              breadcrumbs={live ? crumbs : demoRef.current!.breadcrumbs()}
              regroup={regroup}
              deadZoneSegments={deadZoneSegments}
              me={myPosition}
              onVehicleClick={setSelectedVehicle}
              onMapLongPress={canCommand ? (p) => (setRegroupDraft(p), setDialog("regroup")) : undefined}
              className="h-[56vh] min-h-[420px]"
            />
            <CockpitHud
              className="absolute left-3 top-3 z-10"
              kph={fix ? fix.speedKph : me_ ? me_.speedKph : null}
              headingDeg={fix ? fix.headingDeg : me_ ? me_.headingDeg : null}
              intel={report ?? null}
            />
            <div className="absolute bottom-4 left-4 z-10">
              <SosButton onClick={() => setDialog("sos")} />
            </div>
          </div>

          {/* Driving controls */}
          <Card className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Toggle on={sharing} onClick={() => (live && !canDrive ? notify("Join with a car to share location") : setSharing((v) => !v))} icon={Satellite} label={sharing ? "Sharing location" : "Share location"} />
              <Toggle on={crashOn} onClick={async () => (crashDetect.needsPermission ? await crashDetect.requestPermission() : null, setCrashOn((v) => !v))} icon={ShieldCheck} label={crashOn ? "Crash detection on" : "Crash detection"} />
              <Toggle on={voiceOn} onClick={() => setVoiceOn(!voiceOn)} icon={voiceOn ? Mic : MicOff} label={voiceOn ? "Voice read-out" : "Voice off"} />
              {sharing ? <Badge variant={wakeLock ? "default" : "neutral"}>{wakeLock ? "screen stays on" : "screen may sleep"}</Badge> : null}
              {live && canCommand && detail.data ? (
                <span className="ml-auto flex gap-2">
                  {detail.data.status !== "active" ? (
                    <Button size="sm" variant="outline" onClick={() => setConvoyStatus("active")}>
                      <Play className="h-4 w-4" /> Start
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConvoyStatus("paused")}>
                      <Pause className="h-4 w-4" /> Pause
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setConvoyStatus("completed")}>
                    <Square className="h-4 w-4" /> Finish
                  </Button>
                </span>
              ) : null}
            </div>
            {gpsError ? <Notice tone="warn">{gpsError}</Notice> : null}
            {sharing ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" /> Keep KAAFILA open on screen while driving — browsers pause GPS in the background. Plug the phone in.
              </p>
            ) : null}
            <QuickSignals onSend={sendSignal} />
          </Card>
        </div>

        {/* Right column */}
        <div className="grid min-w-0 content-start gap-3">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { id: "intel", label: "Intel" },
              { id: "members", label: "Members" },
              { id: "chat", label: "Chat", badge: live ? socket.signals.length + socket.chat.length || undefined : demoSignals.length || undefined },
              { id: "kitty", label: "Kitty" },
              { id: "invite", label: "Invite" }
            ]}
          />
          {tab === "intel" ? (
            <IntelPanel intel={report} canCommand={canCommand} onSetRegroup={setRegroup} onLeaderEaseOff={live ? undefined : () => setEaseOffUntil(Date.now() + 90_000)} loading={live && !intel} />
          ) : null}
          {tab === "members" ? (
            live ? (
              <RosterPanel detail={detail.data} live={socket.vehicles} intel={intel} myUserId={me?.id} canCommand={canCommand} onChanged={detail.reload} notify={notify} />
            ) : (
              <Card>
                <ul className="grid gap-2 text-sm">
                  {demoVehicles.map((v) => (
                    <li key={v.vehicleId} className="flex items-center justify-between rounded-lg bg-white/[0.04] p-2">
                      <span>
                        <span className="font-medium">{v.displayName}</span> · {v.vehicleName} <Badge variant="neutral">{v.role}</Badge>
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatKph(v.speedKph)} · {v.fuelType === "ev" ? `${v.batteryPct}% battery` : `${v.fuelPct}% fuel`}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          ) : null}
          {tab === "chat" ? (
            live && selectedId ? (
              <ChatPanel convoyId={selectedId} live={socket.chat} signals={socket.signals} onSend={async (b) => void (await (socket.connected ? socket.sendChat(b) : api.post(`/convoys/${selectedId}/messages`, { body: b })))} moving={moving} />
            ) : (
              <ChatPanel convoyId="demo" live={[]} signals={demoSignals} onSend={async () => notify("Demo", "Sign in to chat with a real convoy.")} moving={false} />
            )
          ) : null}
          {tab === "kitty" ? (live && selectedId ? <KittyPanel convoyId={selectedId} version={socket.kittyVersion} myUserId={me?.id} notify={notify} /> : <DemoOnly what="split trip expenses" />) : null}
          {tab === "invite" ? (live && detail.data ? <SharePanel detail={detail.data} notify={notify} /> : <DemoOnly what="invite cars and share a family follow link" />) : null}
        </div>
      </div>

      {me ? <CreateConvoyDialog open={dialog === "create"} onClose={() => setDialog(null)} me={me} onCreated={(id) => (convoys.reload(), choose(id))} /> : null}
      {me ? <JoinConvoyDialog open={dialog === "join"} onClose={() => setDialog(null)} me={me} initialCode={params.get("join") ?? undefined} onJoined={(id) => (convoys.reload(), choose(id))} /> : null}
      <SosDialog open={dialog === "sos"} onClose={() => setDialog(null)} onRaise={(k) => raiseSos(k)} emergencyNumber={emergencyNumber} />
      <CrashCountdown open={Boolean(crash)} peakG={crash?.peakG ?? 0} onCancel={() => setCrash(null)} onConfirm={() => (void raiseSos("crash_detected", crash?.peakG), setCrash(null))} />
      <RegroupDialog open={dialog === "regroup"} point={regroupDraft} onClose={() => setDialog(null)} onSet={(name) => regroupDraft && setRegroup({ name, lat: regroupDraft.lat, lng: regroupDraft.lng })} />
      {toastView}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Power; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition", on ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground")}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function DemoOnly({ what }: { what: string }) {
  return (
    <Card className="text-center">
      <p className="text-sm text-muted-foreground">Sign in and create or join a convoy to {what}.</p>
      <Link href="/login" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Sign in
      </Link>
    </Card>
  );
}

function RegroupDialog({ open, point, onClose, onSet }: { open: boolean; point: GeoPoint | null; onClose: () => void; onSet: (name: string) => void }) {
  const [name, setName] = useState("Regroup point");
  return (
    <Modal open={open} onClose={onClose} title="Set regroup point" description={point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : undefined}>
      <div className="grid gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary" aria-label="Regroup name" />
        <Button
          onClick={() => {
            onSet(name.trim() || "Regroup point");
            onClose();
          }}
        >
          Set for everyone
        </Button>
      </div>
    </Modal>
  );
}
