"use client";

import { useEffect, useState } from "react";
import { FEATURE_REGISTRY } from "@kaafila/shared";
import { api } from "./api";
import { useAuth } from "./auth";

const defaults: Record<string, boolean> = Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.key, f.defaultEnabled && f.defaultRolloutPct >= 100]));

let cache: { token: string | null; flags: Record<string, boolean>; at: number } | null = null;

/** Feature flags for the current user (server-evaluated), falling back to registry defaults. */
export function useFlags(): Record<string, boolean> {
  const { token, status } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean>>(cache?.token === token ? cache.flags : defaults);

  useEffect(() => {
    if (status !== "signed_in" || !token) {
      setFlags(defaults);
      return;
    }
    if (cache && cache.token === token && Date.now() - cache.at < 60_000) {
      setFlags(cache.flags);
      return;
    }
    let cancelled = false;
    api
      .get<Record<string, boolean>>("/platform/flags")
      .then((f) => {
        cache = { token, flags: { ...defaults, ...f }, at: Date.now() };
        if (!cancelled) setFlags(cache.flags);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, status]);

  return flags;
}

export function useFeature(key: string): boolean {
  return useFlags()[key] ?? false;
}
