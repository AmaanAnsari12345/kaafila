import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKph(value: number) {
  return `${Math.round(value)} km/h`;
}

export function formatMeters(value: number) {
  if (value >= 10_000) return `${Math.round(value / 1000)} km`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

export function inr(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export async function shareOrCopy(title: string, url: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}

export function timeUntil(iso: string) {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (s <= 0) return "now";
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  if (s < 86_400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86_400)}d`;
}
