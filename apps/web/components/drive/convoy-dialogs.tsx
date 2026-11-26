"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Route, UserPlus } from "lucide-react";
import { formatDistance, formatDuration, type RoutePlan } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PlaceSearch, type Place } from "./place-search";

export function CreateConvoyDialog({ open, onClose, me, onCreated }: { open: boolean; onClose: () => void; me: Me; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState("");
  const [vehicleId, setVehicleId] = useState(me.vehicles.find((v) => v.isDefault)?.id ?? me.vehicles[0]?.id ?? "");
  const [maxVehicles, setMaxVehicles] = useState(20);
  const [preview, setPreview] = useState<RoutePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    if (!origin || !destination) return;
    let cancelled = false;
    api
      .post<RoutePlan>("/maps/route", { origin: origin.position, destination: destination.position })
      .then((r) => !cancelled && setPreview(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [origin, destination]);

  const submit = async () => {
    if (!origin || !destination) return setError("Pick a start and a destination from the search results.");
    setBusy(true);
    setError(null);
    try {
      const convoy = await api.post<{ id: string }>("/convoys", {
        name: name.trim() || `${origin.name} → ${destination.name}`,
        origin: { ...origin.position, name: origin.name },
        destination: { ...destination.position, name: destination.name },
        plannedDepartureAt: departure ? new Date(departure).toISOString() : undefined,
        vehicleId: vehicleId || undefined,
        maxVehicles
      });
      onCreated(convoy.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a convoy" description="Plans the route, creates an invite code and QR, voice channels and the live room.">
      <div className="grid gap-3">
        <Field label="Convoy name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday breakfast run" maxLength={120} />
        </Field>
        <PlaceSearch label="Start" value={origin} onChange={setOrigin} useMyLocation />
        <PlaceSearch label="Destination" value={destination} onChange={setDestination} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Departure (optional)">
            <Input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} />
          </Field>
          <Field label="Max cars">
            <Input type="number" min={2} max={1000} value={maxVehicles} onChange={(e) => setMaxVehicles(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Your car" hint={me.vehicles.length ? undefined : "Add a car in Garage to drive in convoys."}>
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">I'm not driving (organiser only)</option>
            {me.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        {preview ? (
          <Notice tone={preview.isEstimate ? "warn" : "ok"}>
            <span className="flex items-center gap-2">
              <Route className="h-4 w-4" />
              {formatDistance(preview.distanceMeters)} · {formatDuration(preview.durationSeconds)}
              {preview.isEstimate ? " (straight-line estimate — routing service unavailable)" : ` via ${preview.provider.toUpperCase()}`}
            </span>
          </Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={submit} disabled={busy}>
          <Plus className="h-4 w-4" />
          {busy ? "Creating…" : "Create convoy"}
        </Button>
      </div>
    </Modal>
  );
}

export function JoinConvoyDialog({ open, onClose, me, initialCode, onJoined }: { open: boolean; onClose: () => void; me: Me; initialCode?: string; onJoined: (id: string) => void }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [vehicleId, setVehicleId] = useState(me.vehicles.find((v) => v.isDefault)?.id ?? me.vehicles[0]?.id ?? "");
  const [role, setRole] = useState<"driver" | "family" | "viewer">(me.vehicles.length ? "driver" : "viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ convoyId: string }>("/convoys/join", {
        inviteCode: code.trim().toUpperCase(),
        role,
        vehicleId: role === "driver" ? vehicleId : undefined
      });
      onJoined(res.convoyId);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Join a convoy" description="Enter the invite code from the organiser, or open their invite link.">
      <div className="grid gap-3">
        <Field label="Invite code">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KAA-XXXXXX" className="font-mono uppercase" maxLength={16} />
        </Field>
        <Field label="Joining as">
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="driver" disabled={!me.vehicles.length}>
              Driver (with my car)
            </option>
            <option value="family">Family / passenger (follow along)</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
        {role === "driver" ? (
          me.vehicles.length ? (
            <Field label="Car">
              <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {me.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Notice tone="warn">
              Add your car in <Link href="/garage" className="underline">Garage</Link> first.
            </Notice>
          )
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={submit} disabled={busy || code.trim().length < 4 || (role === "driver" && !vehicleId)}>
          <UserPlus className="h-4 w-4" />
          {busy ? "Joining…" : "Join convoy"}
        </Button>
      </div>
    </Modal>
  );
}
