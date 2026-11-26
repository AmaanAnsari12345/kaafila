"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrashHeuristic, type GeoPoint } from "@kaafila/shared";

export interface GeoFix {
  position: GeoPoint;
  speedKph: number;
  headingDeg: number;
  accuracyMeters: number;
  capturedAtIso: string;
}

/** Foreground GPS. Browsers pause this in the background; the UI says so. */
export function useGeolocation(enabled: boolean) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<GeoFix | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setError("This browser has no GPS access.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const prev = last.current;
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Some browsers report null speed/heading; derive them from consecutive fixes.
        let speedKph = pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : 0;
        let headingDeg = pos.coords.heading ?? prev?.headingDeg ?? 0;
        if (prev && pos.coords.speed === null) {
          const dt = (pos.timestamp - Date.parse(prev.capturedAtIso)) / 1000;
          if (dt > 0) {
            const dLat = (position.lat - prev.position.lat) * 111_320;
            const dLng = (position.lng - prev.position.lng) * 111_320 * Math.cos((position.lat * Math.PI) / 180);
            const dist = Math.hypot(dLat, dLng);
            speedKph = (dist / dt) * 3.6;
            if (dist > 5) headingDeg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
          }
        }
        const next: GeoFix = {
          position,
          speedKph: Math.min(400, Math.max(0, speedKph)),
          headingDeg: ((headingDeg % 360) + 360) % 360,
          accuracyMeters: pos.coords.accuracy,
          capturedAtIso: new Date(pos.timestamp).toISOString()
        };
        last.current = next;
        setFix(next);
        setError(null);
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? "Location permission denied. Enable it in your browser settings." : err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { fix, error };
}

/** Keeps the screen on while the cockpit is open. */
export function useWakeLock(enabled: boolean) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) return void sentinel.release();
        setActive(true);
        sentinel.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [enabled]);
  return active;
}

export function useSpeech() {
  const [enabled, setEnabled] = useState(true);
  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    },
    [enabled]
  );
  return { speak, enabled, setEnabled };
}

interface MotionPermissionEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * Crash heuristic on DeviceMotion + GPS speed. NOT a certified safety system: it only opens a
 * cancellable countdown; the person can always dismiss it.
 */
export function useCrashDetection(enabled: boolean, speedKph: number | undefined, onSuspected: (peakG: number) => void) {
  const heuristic = useRef(new CrashHeuristic());
  const cooldownUntil = useRef(0);
  const [armed, setArmed] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  useEffect(() => {
    if (typeof speedKph === "number") heuristic.current.addSpeed(Date.now(), speedKph);
  }, [speedKph]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    const ctor = window.DeviceMotionEvent as unknown as MotionPermissionEvent;
    if (typeof ctor.requestPermission === "function") setNeedsPermission(true);

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const now = Date.now();
      heuristic.current.addMotion(now, a.x, a.y, a.z);
    };
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now < cooldownUntil.current) return;
      const result = heuristic.current.check(now);
      if (result.suspected) {
        cooldownUntil.current = now + 60_000;
        heuristic.current.reset();
        onSuspected(result.peakG);
      }
    }, 1000);
    window.addEventListener("devicemotion", onMotion);
    setArmed(true);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.clearInterval(timer);
      setArmed(false);
    };
  }, [enabled, onSuspected]);

  const requestPermission = useCallback(async () => {
    const ctor = window.DeviceMotionEvent as unknown as MotionPermissionEvent;
    if (typeof ctor.requestPermission === "function") {
      const res = await ctor.requestPermission();
      setNeedsPermission(res !== "granted");
    }
  }, []);

  return { armed, needsPermission, requestPermission };
}

export function useInterval(fn: () => void, ms: number | null) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** Small data-loading helper with reload. */
export function useLoad<T>(loader: (() => Promise<T>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!loader) return;
    let cancelled = false;
    setLoading(true);
    loader()
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
