import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v !== "replace_me" ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Auth
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  /** Allows the "dev-token" bearer outside production. Never set in production. */
  ALLOW_DEV_TOKEN: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Maps & geo services (all overridable; public instances are for development only)
  ROUTING_PROVIDER: z.enum(["osrm", "google", "none"]).default("osrm"),
  OSRM_BASE_URL: z.string().default("https://router.project-osrm.org"),
  GOOGLE_MAPS_API_KEY: optional,
  GEOCODER_BASE_URL: z.string().default("https://nominatim.openstreetmap.org"),
  OVERPASS_BASE_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  WEATHER_BASE_URL: z.string().default("https://api.open-meteo.com/v1/forecast"),
  OPEN_METEO_API_KEY: optional,
  OSM_USER_AGENT: z.string().optional(),

  // Voice
  LIVEKIT_API_KEY: optional,
  LIVEKIT_API_SECRET: optional,
  LIVEKIT_WS_URL: optional,

  // AI assistant
  ANTHROPIC_API_KEY: optional,
  ASSISTANT_MODEL: z.string().default("claude-opus-5-5"),
  ASSISTANT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  /** voice answers favour latency */
  ASSISTANT_VOICE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  ASSISTANT_HOURLY_LIMIT: z.coerce.number().int().min(1).max(1000).default(60),
  /** cap on public (signed-out) help answers per day, across everyone */
  ASSISTANT_PUBLIC_DAILY_LIMIT: z.coerce.number().int().min(0).max(1_000_000).default(2000),

  // Web Push (VAPID). Generate once with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  // Data retention
  RETENTION_ENABLED: z.enum(["true", "false"]).default("true"),
  RETENTION_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

  // Billing
  PRICE_TAX_MODE: z.enum(["inclusive", "exclusive"]).default("inclusive"),
  GST_RATE: z.coerce.number().min(0).max(1).default(0.18),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  RAZORPAY_PLAN_ID_DRIVE: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_ID_DRIVE: optional
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOW_DEV_TOKEN) {
    throw new Error("ALLOW_DEV_TOKEN must not be enabled in production");
  }

  return parsed.data;
}
