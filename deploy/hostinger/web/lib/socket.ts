"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type ChatMessageEvent,
  type ConvoyStateSnapshot,
  type LiveVehicleState,
  type QuickSignalCode,
  type QuickSignalEvent,
  type RegroupPoint,
  type SosEvent
} from "@kaafila/shared";
import { webConfig } from "./config";

type Ack<T> = { ok: true; data?: T } | { ok: false; error: string; status?: number };

export interface LiveConvoy {
  connected: boolean;
  error: string | null;
  vehicles: Record<string, LiveVehicleState>;
  regroup: RegroupPoint | null;
  signals: QuickSignalEvent[];
  chat: ChatMessageEvent[];
  sos: SosEvent[];
  statusEvents: { type: string; status?: string; reason?: string }[];
  kittyVersion: number;
}

const initial: LiveConvoy = { connected: false, error: null, vehicles: {}, regroup: null, signals: [], chat: [], sos: [], statusEvents: [], kittyVersion: 0 };

export function useConvoySocket(convoyId: string | null, token: string | null, handlers?: { onSignal?: (s: QuickSignalEvent) => void; onSos?: (s: SosEvent) => void }) {
  const [state, setState] = useState<LiveConvoy>(initial);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!convoyId || !token) return;
    setState(initial);
    const socket = io(webConfig.socketUrl, { auth: { token }, transports: ["websocket", "polling"], reconnectionDelayMax: 10_000 });
    socketRef.current = socket;

    const join = () =>
      socket.emit(SOCKET_EVENTS.join, { convoyId }, (ack: Ack<ConvoyStateSnapshot>) => {
        if (!ack.ok) return setState((s) => ({ ...s, error: ack.error }));
        const snap = ack.data!;
        setState((s) => ({ ...s, connected: true, error: null, regroup: snap.regroup, vehicles: Object.fromEntries(snap.vehicles.map((v) => [v.vehicleId, v])) }));
      });

    socket.on("connect", join);
    socket.on("disconnect", () => setState((s) => ({ ...s, connected: false })));
    socket.on("connect_error", (err) => setState((s) => ({ ...s, connected: false, error: err.message })));
    socket.on(SOCKET_EVENTS.locationUpdate, (v: LiveVehicleState) => setState((s) => ({ ...s, vehicles: { ...s.vehicles, [v.vehicleId]: v } })));
    socket.on(SOCKET_EVENTS.regroupNew, (r: RegroupPoint | null) => setState((s) => ({ ...s, regroup: r })));
    socket.on(SOCKET_EVENTS.signalNew, (e: QuickSignalEvent) => {
      setState((s) => ({ ...s, signals: [e, ...s.signals].slice(0, 50) }));
      handlersRef.current?.onSignal?.(e);
    });
    socket.on(SOCKET_EVENTS.chatNew, (e: ChatMessageEvent) => setState((s) => ({ ...s, chat: [...s.chat, e].slice(-200) })));
    socket.on(SOCKET_EVENTS.sosNew, (e: SosEvent) => {
      setState((s) => ({ ...s, sos: [e, ...s.sos.filter((x) => x.id !== e.id)] }));
      handlersRef.current?.onSos?.(e);
    });
    socket.on(SOCKET_EVENTS.sosUpdate, (e: Partial<SosEvent> & { id: string }) =>
      setState((s) => ({ ...s, sos: s.sos.map((x) => (x.id === e.id ? { ...x, ...e } : x)) }))
    );
    socket.on(SOCKET_EVENTS.state, (e: { type: string; status?: string; reason?: string }) => setState((s) => ({ ...s, statusEvents: [e, ...s.statusEvents].slice(0, 10) })));
    socket.on("kitty:updated", () => setState((s) => ({ ...s, kittyVersion: s.kittyVersion + 1 })));

    return () => {
      socket.emit(SOCKET_EVENTS.leave, { convoyId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [convoyId, token]);

  const emit = useCallback(<T,>(event: string, payload: unknown) => {
    return new Promise<T>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) return reject(new Error("Not connected"));
      socket.timeout(10_000).emit(event, payload, (err: Error | null, ack: Ack<T>) => {
        if (err) return reject(new Error("Server did not respond"));
        if (!ack.ok) return reject(new Error(ack.error));
        resolve(ack.data as T);
      });
    });
  }, []);

  return {
    ...state,
    sendPing: (p: { vehicleId: string; lat: number; lng: number; speedKph: number; headingDeg: number; accuracyMeters?: number; fuelPct?: number; batteryPct?: number; capturedAt: string }) =>
      emit<{ accepted: boolean; reason?: string }>(SOCKET_EVENTS.locationPing, { convoyId, ...p }),
    sendSignal: (code: QuickSignalCode, lat?: number, lng?: number) => emit<QuickSignalEvent>(SOCKET_EVENTS.signal, { convoyId, code, lat, lng }),
    sendChat: (body: string) => emit<ChatMessageEvent>(SOCKET_EVENTS.chat, { convoyId, body }),
    raiseSos: (kind: SosEvent["kind"], lat: number, lng: number, peakG?: number) => emit<SosEvent>(SOCKET_EVENTS.sos, { convoyId, kind, lat, lng, peakG }),
    setRegroup: (name: string, lat: number, lng: number) => emit<RegroupPoint>(SOCKET_EVENTS.regroup, { convoyId, name, lat, lng })
  };
}
