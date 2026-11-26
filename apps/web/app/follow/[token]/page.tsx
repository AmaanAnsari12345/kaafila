import type { Metadata } from "next";
import { FollowView } from "@/components/account/join-follow";

export const metadata: Metadata = { title: "Follow convoy", robots: { index: false, follow: false } };

export default async function FollowPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FollowView token={token} />;
}
