"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag, Heart, MessageCircle, Plus, Search, Trash2, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Tabs, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";

interface Author {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface Post {
  id: string;
  body: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  author: Author;
  club: { id: string; name: string; slug: string } | null;
}

interface Club {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  isPublic: boolean;
  _count: { members: number };
}

type Tab = "feed" | "following" | "clubs";

export function CommunityView() {
  const { status } = useAuth();
  const { notify, view } = useToast();
  const [tab, setTab] = useState<Tab>("feed");
  if (status === "signed_out") return <SignInPrompt what="join the community" />;
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Community" title="Car people, clubs and road stories" description="Share trips, join clubs, and find people to drive with." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: "feed", label: "Everyone" },
          { id: "following", label: "Following" },
          { id: "clubs", label: "Clubs" }
        ]}
      />
      {tab === "clubs" ? <Clubs notify={notify} /> : <Feed scope={tab === "following" ? "following" : "all"} notify={notify} />}
      {view}
    </div>
  );
}

export function Feed({ scope, clubId, notify, canPost = true }: { scope?: "all" | "following"; clubId?: string; notify: (t: string, m?: string) => void; canPost?: boolean }) {
  const query = clubId ? `clubId=${clubId}` : `scope=${scope ?? "all"}`;
  const feed = useLoad<{ items: Post[]; nextCursor: string | null }>(() => api.get(`/social/feed?${query}`), [query]);
  const [body, setBody] = useState("");
  const [more, setMore] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const post = async () => {
    try {
      await api.post("/social/posts", { body, clubId });
      setBody("");
      setMore([]);
      setCursor(null);
      feed.reload();
    } catch (err) {
      notify("Couldn't post", errorMessage(err));
    }
  };

  const loadMore = async () => {
    const c = cursor ?? feed.data?.nextCursor;
    if (!c) return;
    const page = await api.get<{ items: Post[]; nextCursor: string | null }>(`/social/feed?${query}&cursor=${c}`);
    setMore((m) => [...m, ...page.items]);
    setCursor(page.nextCursor);
  };

  const items = [...(feed.data?.items ?? []), ...more];
  const hasMore = cursor !== null ? Boolean(cursor) : Boolean(feed.data?.nextCursor);

  return (
    <div className="grid max-w-2xl gap-3">
      {canPost ? (
        <Card>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share a trip, a route tip or a photo story…" maxLength={2000} />
          <div className="mt-2 flex justify-end">
            <Button onClick={post} disabled={!body.trim()}>
              Post
            </Button>
          </div>
        </Card>
      ) : null}
      {feed.error ? <Notice tone="danger">{feed.error}</Notice> : null}
      {feed.data && items.length === 0 ? <Empty>Nothing here yet.</Empty> : null}
      {items.map((p) => (
        <PostCard key={p.id} post={p} notify={notify} onDeleted={feed.reload} />
      ))}
      {hasMore ? (
        <Button variant="outline" onClick={loadMore}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function PostCard({ post, notify, onDeleted }: { post: Post; notify: (t: string, m?: string) => void; onDeleted: () => void }) {
  const { me } = useAuth();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [comments, setComments] = useState<{ id: string; body: string; createdAt: string; author: Author }[] | null>(null);
  const [comment, setComment] = useState("");

  const like = async () => {
    const res = await api.post<{ liked: boolean }>(`/social/posts/${post.id}/like`).catch(() => null);
    if (res) {
      setLiked(res.liked);
      setLikes((n) => n + (res.liked ? 1 : -1));
    }
  };
  const loadComments = async () => setComments(await api.get(`/social/posts/${post.id}/comments`));
  const addComment = async () => {
    try {
      await api.post(`/social/posts/${post.id}/comments`, { body: comment });
      setComment("");
      await loadComments();
    } catch (err) {
      notify("Couldn't comment", errorMessage(err));
    }
  };
  const report = async () => {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason) return;
    await api.post("/social/reports", { subjectType: "post", subjectId: post.id, reason }).then(
      () => notify("Reported", "Our team will review it."),
      (e) => notify("Couldn't report", errorMessage(e))
    );
  };
  const remove = async () => {
    if (!window.confirm("Delete this post?")) return;
    await api.del(`/social/posts/${post.id}`).then(onDeleted, (e) => notify("Couldn't delete", errorMessage(e)));
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/community/u/${post.author.handle ?? post.author.id}`} className="font-medium hover:underline">
            {post.author.displayName}
          </Link>
          <p className="text-xs text-muted-foreground">
            {post.author.handle ? `@${post.author.handle} · ` : ""}
            {timeAgo(post.createdAt)}
            {post.club ? ` · in ${post.club.name}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {post.author.id === me?.id ? (
            <button type="button" onClick={remove} className="rounded p-1.5 text-muted-foreground hover:text-rose-300" aria-label="Delete post">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={report} className="rounded p-1.5 text-muted-foreground hover:text-amber-300" aria-label="Report post">
              <Flag className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" onClick={like} aria-pressed={liked}>
          <Heart className={cn("h-4 w-4", liked && "fill-rose-400 text-rose-400")} /> {likes}
        </Button>
        <Button size="sm" variant="ghost" onClick={loadComments}>
          <MessageCircle className="h-4 w-4" /> {comments?.length ?? post.commentCount}
        </Button>
      </div>
      {comments ? (
        <div className="mt-2 grid gap-2 border-t border-white/10 pt-2">
          {comments.map((c) => (
            <p key={c.id} className="text-sm">
              <span className="font-medium">{c.author.displayName}</span> <span className="text-muted-foreground">{c.body}</span>
            </p>
          ))}
          <div className="flex gap-2">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment.trim() && void addComment()} placeholder="Add a comment" maxLength={1000} />
            <Button size="sm" onClick={addComment} disabled={!comment.trim()}>
              Reply
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Clubs({ notify }: { notify: (t: string, m?: string) => void }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const clubs = useLoad<Club[]>(() => api.get(`/social/clubs${search ? `?q=${encodeURIComponent(search)}` : ""}`), [search]);
  const mine = useLoad<{ club: Club }[]>(() => api.get("/social/clubs/mine"), []);
  const [creating, setCreating] = useState(false);
  const myIds = new Set((mine.data ?? []).map((m) => m.club.id));

  const join = async (id: string) => {
    try {
      await api.post(`/social/clubs/${id}/join`);
      mine.reload();
      notify("Joined club");
    } catch (err) {
      notify("Couldn't join", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSearch(q.trim())} placeholder="Search clubs by name or city" className="pl-9" />
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New club
          </Button>
        </div>
        {clubs.data?.length === 0 ? <Empty>No public clubs match.</Empty> : null}
        {clubs.data?.map((c) => (
          <Card key={c.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/community/clubs/${c.slug}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {c.city ? `${c.city} · ` : ""}
                {c._count.members} members
              </p>
              {c.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p> : null}
            </div>
            {myIds.has(c.id) ? (
              <Badge>member</Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => join(c.id)}>
                Join
              </Button>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle eyebrow="Yours" title="My clubs" right={<Users className="h-4 w-4 text-muted-foreground" />} />
        {mine.data?.length === 0 ? <Empty>You haven't joined a club yet.</Empty> : null}
        <ul className="grid gap-1.5 text-sm">
          {mine.data?.map((m) => (
            <li key={m.club.id}>
              <Link href={`/community/clubs/${m.club.slug}`} className="hover:underline">
                {m.club.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <CreateClub open={creating} onClose={() => setCreating(false)} onCreated={() => (clubs.reload(), mine.reload())} notify={notify} />
    </div>
  );
}

function CreateClub({ open, onClose, onCreated, notify }: { open: boolean; onClose: () => void; onCreated: () => void; notify: (t: string, m?: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const submit = async () => {
    try {
      await api.post("/social/clubs", { name, description: description || undefined, city: city || undefined, isPublic });
      onCreated();
      onClose();
      notify("Club created");
    } catch (err) {
      notify("Couldn't create club", errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Start a club">
      <div className="grid gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </Field>
        <Field label="About">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-teal-400" /> Public (anyone can find and join)
        </label>
        <Button onClick={submit} disabled={name.trim().length < 3}>
          Create club
        </Button>
      </div>
    </Modal>
  );
}
