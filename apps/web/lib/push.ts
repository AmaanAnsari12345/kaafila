"use client";

import { api } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe this browser and register it with the API. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("This browser doesn't support background alerts. On iPhone, add KAAFILA to the Home Screen first (iOS 16.4+).");
  const { enabled, publicKey } = await api.get<{ enabled: boolean; publicKey: string | null }>("/notifications/vapid-public-key", { auth: false });
  if (!enabled || !publicKey) throw new Error("Background alerts aren't configured on this server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post("/notifications/push-subscriptions", { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) });
}

export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.del("/notifications/push-subscriptions", { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}
