import { ClubView } from "@/components/community/club-and-profile";

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ClubView slug={slug} />;
}
