import type { Metadata } from "next";
import { CopilotView } from "@/components/copilot/copilot-view";

export const metadata: Metadata = { title: "Co-pilot" };

export default function CopilotPage() {
  return <CopilotView />;
}
