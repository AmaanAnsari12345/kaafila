const env = (value: string | undefined) => (value && value !== "replace_me" ? value : "");

export const webConfig = {
  apiBaseUrl: env(process.env.NEXT_PUBLIC_API_BASE_URL) || "http://localhost:4000",
  socketUrl: env(process.env.NEXT_PUBLIC_SOCKET_URL) || "http://localhost:4000",
  /** MapLibre style. Default: OpenFreeMap public style (free, no key, provided as-is). */
  mapStyleUrl: env(process.env.NEXT_PUBLIC_MAP_STYLE_URL) || "https://tiles.openfreemap.org/styles/liberty",
  supabaseUrl: env(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: env(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  /** Development only: sign in with a dev token accepted when the API runs with ALLOW_DEV_TOKEN=true. */
  devAuth: process.env.NEXT_PUBLIC_DEV_AUTH === "true",
  razorpayKeyId: env(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID),
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || "support@kaafila.app"
};

export const hasSupabase = Boolean(webConfig.supabaseUrl && webConfig.supabaseAnonKey);
