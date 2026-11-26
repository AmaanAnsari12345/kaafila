import { ProfileView } from "@/components/community/club-and-profile";

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle)} />;
}
