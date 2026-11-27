"use client";

import Link from "next/link";
import { CalendarDays, CarFront, UserCheck, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Notice } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";
import { Feed } from "./community-view";

interface ClubDetail {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  city?: string | null;
  isPublic: boolean;
  isMember: boolean;
  myRole?: string | null;
  owner?: { displayName: string };
  _count: { members: number; posts?: number };
  meetups?: { id: string; title: string; startsAt: string; venueName: string }[];
}

export function ClubView({ slug }: { slug: string }) {
  const { status } = useAuth();
  const { notify, view } = useToast();
  const club = useLoad<ClubDetail>(status === "signed_in" ? () => api.get(`/social/clubs/${slug}`) : null, [slug, status]);
  if (status === "signed_out") return <SignInPrompt what="see this club" />;
  if (club.error) return <Notice tone="danger">{club.error}</Notice>;
  const c = club.data;
  if (!c) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const toggle = async () => {
    try {
      if (c.isMember) await api.del(`/social/clubs/${c.id}/membership`);
      else await api.post(`/social/clubs/${c.id}/join`);
      club.reload();
    } catch (err) {
      notify("Couldn't update membership", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={c.isPublic ? "Public club" : "Private club"}
        title={c.name}
        description={[c.city, `${c._count.members} members`, c.owner ? `run by ${c.owner.displayName}` : null].filter(Boolean).join(" · ")}
        actions={
          c.myRole === "owner" ? (
            <Badge>owner</Badge>
          ) : (
            <Button variant={c.isMember ? "outline" : "default"} onClick={toggle} disabled={!c.isPublic && !c.isMember}>
              {c.isMember ? "Leave club" : "Join club"}
            </Button>
          )
        }
      />
      {c.description ? <p className="max-w-2xl text-sm text-muted-foreground">{c.description}</p> : null}
      {!c.isPublic && !c.isMember ? <Notice tone="info">This club is invite-only.</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {c.isPublic || c.isMember ? <Feed clubId={c.id} notify={notify} canPost={c.isMember} /> : <div />}
        <Card>
          <CardTitle eyebrow="Upcoming" title="Club meetups" right={<CalendarDays className="h-4 w-4 text-muted-foreground" />} />
          {!c.meetups?.length ? <Empty>No meetups scheduled.</Empty> : null}
          <ul className="grid gap-2 text-sm">
            {c.meetups?.map((m) => (
              <li key={m.id}>
                <Link href={`/meetups/${m.id}`} className="font-medium hover:underline">
                  {m.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(m.startsAt)} · {m.venueName}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {view}
    </div>
  );
}

interface Profile {
  id: string;
  displayName: string;
  handle: string | null;
  bio: string | null;
  homeCity: string | null;
  createdAt: string;
  followedByMe: boolean;
  stats: { followers: number; following: number; completedConvoys: number };
  showcase: { id: string; name: string; type: string; make: string | null; model: string | null; year: number | null; color: string | null; photoUrl: string | null; mods?: { id: string; category: string; name: string; brand: string | null }[] }[];
  posts: { id: string; body: string; createdAt: string; likeCount: number }[];
}

export function ProfileView({ handle }: { handle: string }) {
  const { status, me } = useAuth();
  const { notify, view } = useToast();
  const profile = useLoad<Profile>(status === "signed_in" ? () => api.get(`/social/profiles/${encodeURIComponent(handle)}`) : null, [handle, status]);
  if (status === "signed_out") return <SignInPrompt what="see profiles" />;
  if (profile.error) return <Notice tone="danger">{profile.error}</Notice>;
  const p = profile.data;
  if (!p) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const follow = async () => {
    try {
      await api.post(`/social/users/${p.id}/follow`);
      profile.reload();
    } catch (err) {
      notify("Couldn't follow", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={p.handle ? `@${p.handle}` : "Driver"}
        title={p.displayName}
        description={[p.homeCity, `joined ${timeAgo(p.createdAt).replace(" ago", "")} ago`].filter(Boolean).join(" · ")}
        actions={
          p.id !== me?.id ? (
            <Button variant={p.followedByMe ? "outline" : "default"} onClick={follow}>
              {p.followedByMe ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {p.followedByMe ? "Following" : "Follow"}
            </Button>
          ) : (
            <Link href="/profile" className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10">
              Edit profile
            </Link>
          )
        }
      />
      {p.bio ? <p className="max-w-2xl text-sm">{p.bio}</p> : null}
      <div className="grid max-w-lg grid-cols-3 gap-2 text-center">
        {[
          ["Followers", p.stats.followers],
          ["Following", p.stats.following],
          ["Convoys", p.stats.completedConvoys]
        ].map(([label, value]) => (
          <Card key={label as string} className="p-3">
            <p className="text-xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle eyebrow="Garage" title="Showcase" right={<CarFront className="h-4 w-4 text-muted-foreground" />} />
        {p.showcase.length === 0 ? <Empty>No cars on show.</Empty> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.showcase.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-lg border border-white/10">
              {v.photoUrl ? <img src={v.photoUrl} alt={v.name} className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-white/[0.04]"><CarFront className="h-10 w-10 text-muted-foreground" /></div>}
              <div className="p-3">
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-muted-foreground">{[v.make, v.model, v.year, v.color].filter(Boolean).join(" · ")}</p>
                {v.mods?.length ? (
                  <div className="mt-2">
                    <p className="hud-label">Build · {v.mods.length} parts</p>
                    <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                      {v.mods.slice(0, 6).map((m) => (
                        <li key={m.id}>
                          {m.name}
                          {m.brand ? ` · ${m.brand}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardTitle title="Recent posts" />
        {p.posts.length === 0 ? <Empty>No public posts yet.</Empty> : null}
        <ul className="grid gap-3">
          {p.posts.map((post) => (
            <li key={post.id} className="border-b border-white/5 pb-3 text-sm">
              <p className="whitespace-pre-wrap">{post.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timeAgo(post.createdAt)} · {post.likeCount} likes
              </p>
            </li>
          ))}
        </ul>
      </Card>
      {view}
    </div>
  );
}
