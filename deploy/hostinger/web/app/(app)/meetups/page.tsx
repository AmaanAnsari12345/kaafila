import type { Metadata } from "next";
import { MeetupsView } from "@/components/meetups/meetups-view";

export const metadata: Metadata = { title: "Meetups" };

export default function MeetupsPage() {
  return <MeetupsView />;
}
