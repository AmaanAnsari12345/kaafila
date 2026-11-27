import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { AuthProvider } from "@/lib/auth";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "KAAFILA™ — drive together", template: "%s · KAAFILA" },
  description:
    "The group-driving operating system: live convoy formation, Elastic Band pacing, weakest-link fuel range, fair regroup points, crash-aware SOS, voice AI co-pilot, group calls, car care, clubs and meetups. ₹500 per car per month.",
  applicationName: "KAAFILA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "KAAFILA", statusBarStyle: "black-translucent" },
  icons: { icon: "/brand/kaafila-mark.svg", apple: "/brand/kaafila-mark.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#03050a"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <RegisterServiceWorker />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
