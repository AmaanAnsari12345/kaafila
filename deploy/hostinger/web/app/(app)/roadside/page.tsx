import type { Metadata } from "next";
import { RoadsideView } from "@/components/roadside/roadside-view";

export const metadata: Metadata = { title: "Roadside help" };

export default function RoadsidePage() {
  return <RoadsideView />;
}
