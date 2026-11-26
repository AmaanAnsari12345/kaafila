import { JoinView } from "@/components/account/join-follow";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinView code={decodeURIComponent(code)} />;
}
