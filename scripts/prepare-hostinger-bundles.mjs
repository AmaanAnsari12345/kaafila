import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const deployRoot = path.join(rootDir, "deploy", "hostinger");
const webSourceDir = path.join(rootDir, "apps", "web");
const apiSourceDir = path.join(rootDir, "apps", "api");
const sharedSourceDir = path.join(rootDir, "packages", "shared");
const tsconfigBasePath = path.join(rootDir, "tsconfig.base.json");

const appIgnoreNames = new Set(["node_modules", ".next", "dist", "coverage", ".turbo"]);
const sharedIgnoreNames = new Set(["node_modules", "dist-test", "__tests__"]);
const ignoreSuffixes = [".tsbuildinfo"];

function shouldCopy(sourcePath, ignoreNames) {
  const name = path.basename(sourcePath);
  if (ignoreNames.has(name)) {
    return false;
  }

  return !ignoreSuffixes.some((suffix) => name.endsWith(suffix));
}

async function copyDirectory(sourceDir, destinationDir, ignoreNames) {
  await cp(sourceDir, destinationDir, {
    recursive: true,
    filter: (sourcePath) => shouldCopy(sourcePath, ignoreNames)
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createWebEnvTemplate() {
  return [
    "NODE_ENV=production",
    "NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com",
    "NEXT_PUBLIC_SOCKET_URL=https://your-api-domain.com",
    "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_me",
    "NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID=replace_me",
    "NEXT_PUBLIC_SUPPORT_EMAIL=support@your-domain.com",
    "NEXT_PUBLIC_DEV_AUTH=false",
    ""
  ].join("\n");
}

function createApiEnvTemplate() {
  return [
    "NODE_ENV=production",
    "PORT=4000",
    "PUBLIC_APP_URL=https://your-web-domain.com",
    "DATABASE_URL=postgresql://username:password@host:5432/kaafila?schema=public",
    "REDIS_URL=redis://host:6379",
    "SUPABASE_URL=https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=replace_me",
    "ALLOW_DEV_TOKEN=false",
    "ROUTING_PROVIDER=osrm",
    "OSRM_BASE_URL=https://your-self-hosted-osrm",
    "GEOCODER_BASE_URL=https://your-self-hosted-nominatim",
    "OVERPASS_BASE_URL=https://your-self-hosted-overpass/api/interpreter",
    "WEATHER_BASE_URL=https://customer-api.open-meteo.com/v1/forecast",
    "OPEN_METEO_API_KEY=replace_me",
    "OSM_USER_AGENT=KAAFILA/1.0 (+https://your-web-domain.com)",
    "LIVEKIT_API_KEY=replace_me",
    "LIVEKIT_API_SECRET=replace_me",
    "LIVEKIT_WS_URL=wss://livekit.example.com",
    "ANTHROPIC_API_KEY=replace_me",
    "ASSISTANT_MODEL=claude-opus-5-5",
    "PRICE_TAX_MODE=inclusive",
    "GST_RATE=0.18",
    "RAZORPAY_KEY_ID=replace_me",
    "RAZORPAY_KEY_SECRET=replace_me",
    "RAZORPAY_WEBHOOK_SECRET=replace_me",
    "RAZORPAY_PLAN_ID_DRIVE=replace_me",
    "STRIPE_SECRET_KEY=replace_me",
    "STRIPE_WEBHOOK_SECRET=replace_me",
    "STRIPE_PRICE_ID_DRIVE=replace_me",
    ""
  ].join("\n");
}

function createWebReadme() {
  return [
    "# KAAFILA Hostinger Web Upload",
    "",
    "Upload this entire folder as a Hostinger Next.js app.",
    "",
    "Recommended Hostinger settings:",
    "- Build command: `npm run build`",
    "- Start command: `npm run start`",
    "- Node version: `22` if available, otherwise `20`",
    "",
    "Before deploy:",
    "1. Rename `.env.example` to `.env` in the Hostinger file manager or set the same values in the environment UI.",
    "2. Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SOCKET_URL` to your deployed API domain.",
    "3. Set the Supabase, Maps, LiveKit, and billing keys.",
    "",
    "Route notes:",
    "- Landing: `/`, cockpit: `/drive`, roadside: `/roadside`",
    "- Operations console (staff only): `/admin`",
    "- PWA manifest: `/manifest.webmanifest`",
    "- Service worker: `/sw.js`",
    ""
  ].join("\n");
}

function createApiReadme() {
  return [
    "# KAAFILA Hostinger API Upload",
    "",
    "Upload this entire folder as a Hostinger NestJS app.",
    "",
    "Recommended Hostinger settings:",
    "- Build command: `npm run build`",
    "- Start command: `npm run start`",
    "- Node version: `22` if available, otherwise `20`",
    "",
    "Before deploy:",
    "1. Rename `.env.example` to `.env` in the Hostinger file manager or set the same values in the environment UI.",
    "2. Set `DATABASE_URL` and `REDIS_URL` to your managed services.",
    "3. Set Supabase, Maps, LiveKit, and payment secrets.",
    "4. Run Prisma deploy command once after the first upload: `npx prisma migrate deploy`.",
    "",
    "Health endpoint after deploy:",
    "- `/v1/health`",
    ""
  ].join("\n");
}

async function prepareWebBundle() {
  const webBundleDir = path.join(deployRoot, "web");
  const vendorSharedDir = path.join(webBundleDir, "vendor", "shared");

  await mkdir(path.join(webBundleDir, "vendor"), { recursive: true });
  await copyDirectory(webSourceDir, webBundleDir, appIgnoreNames);
  await copyDirectory(sharedSourceDir, vendorSharedDir, sharedIgnoreNames);
  await cp(tsconfigBasePath, path.join(webBundleDir, "tsconfig.base.json"));

  const webPackageJson = JSON.parse(
    await readFile(path.join(webBundleDir, "package.json"), "utf8")
  );
  webPackageJson.name = "kaafila-hostinger-web";
  webPackageJson.dependencies["@kaafila/shared"] = "file:./vendor/shared";
  delete webPackageJson.packageManager;
  await writeJson(path.join(webBundleDir, "package.json"), webPackageJson);

  const webTsconfig = JSON.parse(await readFile(path.join(webBundleDir, "tsconfig.json"), "utf8"));
  webTsconfig.extends = "./tsconfig.base.json";
  webTsconfig.compilerOptions.paths = {
    "@/*": ["./*"]
  };
  await writeJson(path.join(webBundleDir, "tsconfig.json"), webTsconfig);

  const hostingerNextConfig = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)"
          }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      }
    ];
  }
};

export default nextConfig;
`;
  await writeFile(path.join(webBundleDir, "next.config.ts"), hostingerNextConfig, "utf8");
  await writeFile(path.join(webBundleDir, ".env.example"), createWebEnvTemplate(), "utf8");
  await writeFile(path.join(webBundleDir, "README.md"), createWebReadme(), "utf8");
}

async function prepareApiBundle() {
  const apiBundleDir = path.join(deployRoot, "api");
  const vendorSharedDir = path.join(apiBundleDir, "vendor", "shared");

  await mkdir(path.join(apiBundleDir, "vendor"), { recursive: true });
  await copyDirectory(apiSourceDir, apiBundleDir, appIgnoreNames);
  await copyDirectory(sharedSourceDir, vendorSharedDir, sharedIgnoreNames);
  await cp(tsconfigBasePath, path.join(apiBundleDir, "tsconfig.base.json"));

  const apiPackageJson = JSON.parse(
    await readFile(path.join(apiBundleDir, "package.json"), "utf8")
  );
  apiPackageJson.name = "kaafila-hostinger-api";
  apiPackageJson.dependencies["@kaafila/shared"] = "file:./vendor/shared";
  delete apiPackageJson.packageManager;
  await writeJson(path.join(apiBundleDir, "package.json"), apiPackageJson);

  const apiTsconfig = JSON.parse(await readFile(path.join(apiBundleDir, "tsconfig.json"), "utf8"));
  apiTsconfig.extends = "./tsconfig.base.json";
  apiTsconfig.compilerOptions.baseUrl = ".";
  delete apiTsconfig.compilerOptions.paths;
  await writeJson(path.join(apiBundleDir, "tsconfig.json"), apiTsconfig);

  await writeFile(path.join(apiBundleDir, ".env.example"), createApiEnvTemplate(), "utf8");
  await writeFile(path.join(apiBundleDir, "README.md"), createApiReadme(), "utf8");
}

async function main() {
  // The vendored shared package ships its compiled dist/; build it first.
  try {
    await readFile(path.join(sharedSourceDir, "dist", "index.js"));
  } catch {
    throw new Error("packages/shared/dist is missing. Run: pnpm --filter @kaafila/shared build");
  }
  await rm(deployRoot, { recursive: true, force: true });
  await mkdir(deployRoot, { recursive: true });

  await Promise.all([prepareWebBundle(), prepareApiBundle()]);

  const rootReadme = [
    "# Hostinger Upload Bundles",
    "",
    "- `web/` is the Next.js app upload package.",
    "- `api/` is the NestJS app upload package.",
    "",
    "Upload each folder as a separate Hostinger Node.js application.",
    ""
  ].join("\n");

  await writeFile(path.join(deployRoot, "README.md"), rootReadme, "utf8");
  console.log(`Prepared Hostinger bundles in ${deployRoot}`);
}

await main();
