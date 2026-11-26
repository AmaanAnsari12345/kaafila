"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { api, setTokenProvider } from "./api";
import { hasSupabase, webConfig } from "./config";

export interface Me {
  id: string;
  displayName: string;
  email?: string | null;
  handle?: string | null;
  role: "user" | "admin" | "support";
  plan: "explorer" | "drive" | "fleet";
  upiVpa?: string | null;
  bloodGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  countryCode?: string | null;
  vehicles: { id: string; name: string; type: string; isDefault: boolean; fuelType?: string | null; rangeKmFull?: number | null }[];
}

type Status = "loading" | "signed_out" | "signed_in";

interface AuthState {
  status: Status;
  token: string | null;
  me: Me | null;
  supabase: SupabaseClient | null;
  error: string | null;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDev: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const DEV_TOKEN_KEY = "kaafila.devToken";

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => (hasSupabase ? createClient(webConfig.supabaseUrl, webConfig.supabaseAnonKey) : null), []);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    setTokenProvider(() => tokenRef.current);
  }, []);

  const loadMe = useCallback(async (t: string | null) => {
    tokenRef.current = t;
    setToken(t);
    if (!t) {
      setMe(null);
      setStatus("signed_out");
      return;
    }
    try {
      setMe(await api.get<Me>("/users/me"));
      setStatus("signed_in");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setMe(null);
      setStatus("signed_out");
    }
  }, []);

  useEffect(() => {
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => loadMe(data.session?.access_token ?? null));
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token !== tokenRef.current) void loadMe(session?.access_token ?? null);
      });
      return () => sub.subscription.unsubscribe();
    }
    const dev = webConfig.devAuth ? window.localStorage.getItem(DEV_TOKEN_KEY) : null;
    void loadMe(dev);
    return undefined;
  }, [supabase, loadMe]);

  const value: AuthState = {
    status,
    token,
    me,
    supabase,
    error,
    async signInWithEmail(email) {
      if (!supabase) throw new Error("Email sign-in is not configured");
      const { error: e } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/drive` } });
      if (e) throw e;
    },
    async signInWithGoogle() {
      if (!supabase) throw new Error("Google sign-in is not configured");
      const { error: e } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/drive` } });
      if (e) throw e;
    },
    async signInDev(name) {
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "driver";
      const t = clean === "admin" ? "dev-token" : `dev-token:${clean}`;
      window.localStorage.setItem(DEV_TOKEN_KEY, t);
      await loadMe(t);
    },
    async signOut() {
      window.localStorage.removeItem(DEV_TOKEN_KEY);
      if (supabase) await supabase.auth.signOut();
      await loadMe(null);
    },
    refreshMe: () => loadMe(tokenRef.current)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
