import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectView } from "@/components/connect/connect-view";

export const metadata: Metadata = { title: "Connect devices" };

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectView />
    </Suspense>
  );
}
