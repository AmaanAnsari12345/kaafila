import type { Metadata } from "next";
import { Suspense } from "react";
import { Cockpit } from "@/components/drive/cockpit";

export const metadata: Metadata = { title: "Drive" };

export default function DrivePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading cockpit…</p>}>
      <Cockpit />
    </Suspense>
  );
}
