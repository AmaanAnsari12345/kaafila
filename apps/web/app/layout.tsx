import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "KAAFILA™ — drive together", template: "%s · KAAFILA" },
  description:
    "The group-driving operating system: live convoy formation, Elastic Band pacing, weakest-link fuel range, fair regroup points, crash-aware SOS, car care, clubs and meetups. ₹500 per car per month.",
  applicationName: "KAAFILA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "KAAFILA", statusBarStyle: "black-translucent" },
  icons: { icon: "/brand/kaafila-mark.svg", apple: "/brand/kaafila-mark.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080b11"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <RegisterServiceWorker />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
