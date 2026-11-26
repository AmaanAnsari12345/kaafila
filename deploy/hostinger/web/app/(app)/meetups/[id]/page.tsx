import { MeetupDetailView } from "@/components/meetups/meetups-view";

export default async function MeetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetupDetailView id={id} />;
}
