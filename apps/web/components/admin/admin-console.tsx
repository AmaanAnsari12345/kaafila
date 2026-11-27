"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BadgeIndianRupee, CalendarDays, Flag, RefreshCw, Shield, Siren, Users } from "lucide-react";
import type { AdminOverview } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInterval, useLoad } from "@/lib/hooks";
import { formatDateTime, inr, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select, Tabs, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";

type Tab = "overview" | "sos" | "users" | "convoys" | "moderation" | "meetups" | "announcements" | "flags" | "revenue" | "audit";

export function AdminConsole() {
  const { me, status } = useAuth();
  const { notify, view } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  if (status === "loading") return null;
  const isAdmin = me?.role === "admin";
  if (me?.role !== "admin" && me?.role !== "support") {
    return <Notice tone="danger">The operations console is for KAAFILA staff. <Link href="/drive" className="underline">Back to Drive</Link></Notice>;
  }
  const items: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "sos", label: "SOS" },
    { id: "users", label: "Users" },
    { id: "convoys", label: "Convoys" },
    { id: "moderation", label: "Moderation" },
    { id: "meetups", label: "Meetup review" },
    { id: "announcements", label: "Announcements" },
    { id: "flags", label: "Feature flags" },
    ...(isAdmin ? ([{ id: "revenue", label: "Revenue" }, { id: "audit", label: "Audit log" }] as const) : [])
  ];
  const props = { notify, isAdmin };
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Operations" title="KAAFILA command" description={`Signed in as ${me.displayName} (${me.role}). Every change here is written to the audit log.`} />
      <Tabs<Tab> value={tab} onChange={setTab} items={items} />
      {tab === "overview" ? <Overview onJump={setTab} /> : null}
      {tab === "sos" ? <SosConsole {...props} /> : null}
      {tab === "users" ? <UsersConsole {...props} /> : null}
      {tab === "convoys" ? <ConvoysConsole {...props} /> : null}
      {tab === "moderation" ? <Moderation {...props} /> : null}
      {tab === "meetups" ? <MeetupReview {...props} /> : null}
      {tab === "announcements" ? <Announcements {...props} /> : null}
      {tab === "flags" ? <Flags {...props} /> : null}
      {tab === "revenue" ? <Revenue /> : null}
      {tab === "audit" ? <Audit /> : null}
      {view}
    </div>
  );
}

interface P {
  notify: (t: string, m?: string) => void;
  isAdmin: boolean;
}

function Overview({ onJump }: { onJump: (t: Tab) => void }) {
  const o = useLoad<AdminOverview>(() => api.get("/admin/overview"), []);
  useInterval(() => o.reload(), 30_000);
  if (o.error) return <Notice tone="danger">{o.error}</Notice>;
  const d = o.data;
  const tiles = d
    ? [
        { label: "Users", value: d.users.toLocaleString("en-IN"), sub: `+${d.newUsers7d} this week`, icon: Users, tab: "users" as Tab },
        { label: "Live convoys", value: d.liveConvoys, sub: `${d.activeVehicles} cars on the road`, icon: Activity, tab: "convoys" as Tab },
        { label: "Open SOS", value: d.openSos, sub: "open or acknowledged", icon: Siren, tab: "sos" as Tab, danger: d.openSos > 0 },
        { label: "Reports", value: d.openReports, sub: "awaiting moderation", icon: Flag, tab: "moderation" as Tab },
        { label: "Meetups to review", value: d.pendingMeetups, sub: "pending", icon: CalendarDays, tab: "meetups" as Tab },
        { label: "MRR", value: inr(d.revenue.mrrMinor), sub: `${d.revenue.activeSeats} paid cars`, icon: BadgeIndianRupee, tab: "revenue" as Tab }
      ]
    : [];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <button key={t.label} type="button" onClick={() => onJump(t.tab)} className={`glass-panel rounded-lg p-4 text-left transition hover:border-primary/40 ${t.danger ? "border-rose-400/50" : ""}`}>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            {t.label}
            <t.icon className={`h-4 w-4 ${t.danger ? "text-rose-300" : "text-primary"}`} />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{t.value}</p>
          <p className="text-xs text-muted-foreground">{t.sub}</p>
        </button>
      ))}
      {d ? <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">Updated {timeAgo(d.generatedAtIso)} · refreshes every 30 s</p> : null}
    </div>
  );
}

interface SosRow {
  id: string;
  kind: string;
  status: string;
  lat: number;
  lng: number;
  notes: string | null;
  createdAt: string;
  user: { displayName: string; phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null };
  convoy: { id: string; name: string } | null;
}

function SosConsole({ notify }: P) {
  const [scope, setScope] = useState<"open" | "all">("open");
  const rows = useLoad<SosRow[]>(() => api.get(`/admin/sos?status=${scope}`), [scope]);
  useInterval(() => rows.reload(), 15_000);
  const act = async (id: string, status: "acknowledged" | "resolved" | "false_alarm") => {
    const note = status === "acknowledged" ? undefined : (window.prompt("Resolution note (optional)") ?? undefined);
    try {
      await api.post(`/sos/${id}/status`, { status, note });
      rows.reload();
    } catch (err) {
      notify("Couldn't update", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle eyebrow="Live" title="SOS incidents" right={<Select className="h-8 w-32" value={scope} onChange={(e) => setScope(e.target.value as "open" | "all")}><option value="open">Open</option><option value="all">All</option></Select>} />
      {rows.data?.length === 0 ? <Empty>No incidents.</Empty> : null}
      <div className="grid gap-2">
        {rows.data?.map((s) => (
          <div key={s.id} className="rounded-lg border border-white/10 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {s.user.displayName} · {s.kind.replace("_", " ")} {s.convoy ? `· ${s.convoy.name}` : ""}
              </p>
              <Badge variant={s.status === "open" ? "danger" : s.status === "acknowledged" ? "amber" : "neutral"}>{s.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(s.createdAt)} ·{" "}
              <a className="underline" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer">
                {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
              </a>
              {s.user.phone ? ` · driver ${s.user.phone}` : ""}
              {s.user.emergencyContactPhone ? ` · contact ${s.user.emergencyContactName ?? ""} ${s.user.emergencyContactPhone}` : ""}
            </p>
            {s.notes ? <p className="mt-1">{s.notes}</p> : null}
            {s.status === "open" || s.status === "acknowledged" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {s.status === "open" ? (
                  <Button size="sm" onClick={() => act(s.id, "acknowledged")}>
                    Acknowledge
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => act(s.id, "resolved")}>
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(s.id, "false_alarm")}>
                  False alarm
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

interface UserRow {
  id: string;
  displayName: string;
  email: string | null;
  handle: string | null;
  role: "user" | "admin" | "support";
  isSuspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  _count: { vehicles: number; memberships: number; subscriptions: number };
}

function UsersConsole({ notify, isAdmin }: P) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const users = useLoad<{ items: UserRow[] }>(() => api.get(`/admin/users${search ? `?q=${encodeURIComponent(search)}` : ""}`), [search]);
  const suspend = async (u: UserRow) => {
    const reason = u.isSuspended ? undefined : window.prompt(`Suspend ${u.displayName}? Reason:`);
    if (!u.isSuspended && !reason) return;
    try {
      await api.patch(`/admin/users/${u.id}/suspension`, { suspended: !u.isSuspended, reason });
      users.reload();
    } catch (err) {
      notify("Couldn't update", errorMessage(err));
    }
  };
  const role = async (u: UserRow, r: string) => {
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role: r });
      users.reload();
    } catch (err) {
      notify("Couldn't change role", errorMessage(err));
    }
  };
  return (
    <Card>
      <div className="mb-3 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSearch(q.trim())} placeholder="Search name, email, handle or id" />
        <Button variant="outline" onClick={() => setSearch(q.trim())}>
          Search
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2">User</th>
              <th>Joined</th>
              <th>Active</th>
              <th>Cars · convoys · subs</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.data?.items.map((u) => (
              <tr key={u.id}>
                <td className="py-2">
                  <p className="font-medium">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">{u.email ?? u.handle ?? u.id}</p>
                </td>
                <td className="text-xs">{formatDateTime(u.createdAt)}</td>
                <td className="text-xs">{u.lastActiveAt ? timeAgo(u.lastActiveAt) : "—"}</td>
                <td className="text-xs tabular-nums">
                  {u._count.vehicles} · {u._count.memberships} · {u._count.subscriptions}
                </td>
                <td>
                  {isAdmin ? (
                    <Select className="h-8 w-28 text-xs" value={u.role} onChange={(e) => role(u, e.target.value)}>
                      <option value="user">user</option>
                      <option value="support">support</option>
                      <option value="admin">admin</option>
                    </Select>
                  ) : (
                    <Badge variant="neutral">{u.role}</Badge>
                  )}
                </td>
                <td className="text-right">
                  <Button size="sm" variant={u.isSuspended ? "outline" : "ghost"} onClick={() => suspend(u)} title={u.suspendedReason ?? undefined}>
                    {u.isSuspended ? "Unsuspend" : "Suspend"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface ConvoyRow {
  id: string;
  name: string;
  status: string;
  visibility: string;
  originName: string | null;
  destinationName: string | null;
  startedAt: string | null;
  createdAt: string;
  owner: { displayName: string };
  _count: { members: number; sosIncidents: number };
}

function ConvoysConsole({ notify, isAdmin }: P) {
  const [scope, setScope] = useState<"live" | "all">("live");
  const rows = useLoad<ConvoyRow[]>(() => api.get(`/admin/convoys?status=${scope}`), [scope]);
  const end = async (c: ConvoyRow) => {
    const reason = window.prompt(`Force-end "${c.name}"? Every member sees the reason. Reason:`);
    if (!reason) return;
    try {
      await api.post(`/admin/convoys/${c.id}/force-end`, { reason });
      rows.reload();
    } catch (err) {
      notify("Couldn't end convoy", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle title="Convoys" right={<Select className="h-8 w-32" value={scope} onChange={(e) => setScope(e.target.value as "live" | "all")}><option value="live">Live</option><option value="all">All</option></Select>} />
      {rows.data?.length === 0 ? <Empty>No convoys.</Empty> : null}
      <div className="grid gap-2">
        {rows.data?.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3 text-sm">
            <div>
              <p className="font-medium">
                {c.name} <Badge variant="neutral">{c.status}</Badge> {c._count.sosIncidents ? <Badge variant="danger">{c._count.sosIncidents} SOS</Badge> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.originName ?? "?"} → {c.destinationName ?? "?"} · {c._count.members} members · owner {c.owner.displayName} · {c.startedAt ? `started ${timeAgo(c.startedAt)}` : `created ${timeAgo(c.createdAt)}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/drive?c=${c.id}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/10">
                View
              </Link>
              {isAdmin && ["boarding", "active", "paused"].includes(c.status) ? (
                <Button size="sm" variant="ghost" onClick={() => end(c)}>
                  Force end
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface ModerationData {
  reports: { id: string; subjectType: string; subjectId: string; reason: string; status: string; createdAt: string; reporter: { displayName: string } }[];
  hiddenPosts: { id: string; body: string; author: { displayName: string } }[];
  disputedRoadReports: { id: string; type: string; lat: number; lng: number; confirmations: number; dismissals: number }[];
}

function Moderation({ notify }: P) {
  const m = useLoad<ModerationData>(() => api.get("/admin/moderation"), []);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      m.reload();
    } catch (err) {
      notify("Action failed", errorMessage(err));
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle eyebrow="Queue" title="User reports" right={<AlertTriangle className="h-4 w-4 text-amber-300" />} />
        {m.data?.reports.length === 0 ? <Empty>Queue is clear.</Empty> : null}
        <div className="grid gap-2">
          {m.data?.reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 p-3 text-sm">
              <p className="font-medium">
                {r.subjectType} <span className="font-mono text-xs text-muted-foreground">{r.subjectId}</span>
              </p>
              <p>{r.reason}</p>
              <p className="text-xs text-muted-foreground">
                by {r.reporter.displayName} · {timeAgo(r.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => run(() => api.post(`/admin/reports/${r.id}/resolve`, { decision: "resolved", hideSubject: true }))}>
                  Uphold & remove
                </Button>
                <Button size="sm" variant="outline" onClick={() => run(() => api.post(`/admin/reports/${r.id}/resolve`, { decision: "resolved", hideSubject: false }))}>
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api.post(`/admin/reports/${r.id}/resolve`, { decision: "rejected" }))}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <CardTitle title="Hidden posts" />
          {m.data?.hiddenPosts.length === 0 ? <Empty>None.</Empty> : null}
          {m.data?.hiddenPosts.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 border-b border-white/5 py-2 text-sm">
              <p className="line-clamp-2">
                <span className="font-medium">{p.author.displayName}:</span> {p.body}
              </p>
              <Button size="sm" variant="outline" onClick={() => run(() => api.patch(`/admin/posts/${p.id}/visibility`, { hidden: false }))}>
                Restore
              </Button>
            </div>
          ))}
        </Card>
        <Card>
          <CardTitle title="Disputed road reports" />
          {m.data?.disputedRoadReports.length === 0 ? <Empty>None.</Empty> : null}
          {m.data?.disputedRoadReports.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-2 text-sm">
              <span>
                {r.type} · +{r.confirmations} / −{r.dismissals}
              </span>
              <Button size="sm" variant="ghost" onClick={() => run(() => api.post(`/admin/road-reports/${r.id}/remove`))}>
                Remove
              </Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function MeetupReview({ notify }: P) {
  const rows = useLoad<{ id: string; title: string; description: string; startsAt: string; venueName: string; city: string | null; capacity: number; host: { displayName: string; email: string | null } }[]>(
    () => api.get("/admin/meetups/pending"),
    []
  );
  const review = async (id: string, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Reason shown to the host:") : undefined;
    if (decision === "reject" && !note) return;
    try {
      await api.post(`/admin/meetups/${id}/review`, { decision, note });
      rows.reload();
    } catch (err) {
      notify("Couldn't review", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle title="Meetups awaiting review" />
      {rows.data?.length === 0 ? <Empty>Nothing to review.</Empty> : null}
      <div className="grid gap-3">
        {rows.data?.map((m) => (
          <div key={m.id} className="rounded-lg border border-white/10 p-3 text-sm">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(m.startsAt)} · {m.venueName}
              {m.city ? `, ${m.city}` : ""} · up to {m.capacity} · host {m.host.displayName}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{m.description}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => review(m.id, "approve")}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => review(m.id, "reject")}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Announcements({ notify, isAdmin }: P) {
  const rows = useLoad<{ id: string; title: string; body: string; countryCode: string | null; severity: string; createdAt: string; endsAt: string | null }[]>(() => api.get("/admin/announcements"), []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [country, setCountry] = useState("");
  const [severity, setSeverity] = useState("info");
  const create = async () => {
    try {
      await api.post("/admin/announcements", { title, body, countryCode: country || undefined, severity });
      setTitle("");
      setBody("");
      rows.reload();
    } catch (err) {
      notify("Couldn't publish", errorMessage(err));
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {isAdmin ? (
        <Card>
          <CardTitle title="New announcement" />
          <div className="grid gap-3">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Message">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country (blank = everyone)">
                <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
              </Field>
              <Field label="Severity">
                <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="critical">critical</option>
                </Select>
              </Field>
            </div>
            <Button onClick={create} disabled={title.length < 3 || body.length < 3}>
              Publish
            </Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <CardTitle title="Published" />
        {rows.data?.length === 0 ? <Empty>None.</Empty> : null}
        {rows.data?.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 border-b border-white/5 py-2 text-sm">
            <div>
              <p className="font-medium">
                {a.title} <Badge variant={a.severity === "critical" ? "danger" : a.severity === "warning" ? "amber" : "neutral"}>{a.severity}</Badge> {a.countryCode ? <Badge variant="neutral">{a.countryCode}</Badge> : null}
              </p>
              <p className="text-muted-foreground">{a.body}</p>
            </div>
            {isAdmin ? (
              <Button size="sm" variant="ghost" onClick={() => api.del(`/admin/announcements/${a.id}`).then(rows.reload, (e) => notify("Couldn't delete", errorMessage(e)))}>
                Delete
              </Button>
            ) : null}
          </div>
        ))}
      </Card>
    </div>
  );
}

interface FlagRow {
  key: string;
  name: string;
  description: string | null;
  stage: "live" | "beta" | "planned" | "custom";
  target: string | null;
  enabled: boolean;
  rolloutPct: number;
  overridden: boolean;
}

const STAGE_TONE = { live: "default", beta: "amber", planned: "neutral", custom: "neutral" } as const;

function Flags({ notify, isAdmin }: P) {
  const rows = useLoad<FlagRow[]>(() => api.get("/admin/flags"), []);
  const [key, setKey] = useState("");
  const save = async (k: string, enabled: boolean, rolloutPct: number, description?: string | null) => {
    try {
      await api.put(`/admin/flags/${encodeURIComponent(k)}`, { enabled, rolloutPct, description: description ?? undefined });
      rows.reload();
    } catch (err) {
      notify("Couldn't save flag", errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle eyebrow="Staged rollout" title="Features & flags" right={<Shield className="h-4 w-4 text-muted-foreground" />} />
      <p className="mb-3 text-sm text-muted-foreground">Roll features out to a percentage of users. The same user always lands in the same bucket, so raising the percentage only adds people.</p>
      {isAdmin ? (
        <div className="mb-3 flex gap-2">
          <Input value={key} onChange={(e) => setKey(e.target.value.replace(/[^a-z0-9_.-]/gi, "").toLowerCase())} placeholder="new_flag_key" maxLength={60} />
          <Button variant="outline" onClick={() => key && (void save(key, false, 0), setKey(""))}>
            Add flag
          </Button>
        </div>
      ) : null}
      {rows.data?.length === 0 ? <Empty>No flags yet.</Empty> : null}
      <div className="grid gap-2">
        {rows.data?.map((f) => (
          <div key={f.key} className="grid gap-2 rounded-lg border border-white/10 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {f.name}
                <Badge variant={STAGE_TONE[f.stage]}>{f.stage}</Badge>
                {f.target ? <span className="text-xs text-muted-foreground">target {f.target}</span> : null}
                {!f.overridden ? <span className="text-xs text-muted-foreground">default</span> : null}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{f.key}</p>
              {f.description ? <p className="mt-1 text-xs text-muted-foreground">{f.description}</p> : null}
            </div>
            <span className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                rollout
                <input type="number" min={0} max={100} defaultValue={f.rolloutPct} disabled={!isAdmin} className="h-8 w-16 rounded border border-white/10 bg-black/30 px-2" onBlur={(e) => Number(e.target.value) !== f.rolloutPct && save(f.key, f.enabled, Number(e.target.value), f.description)} />%
              </label>
              <Button size="sm" variant={f.enabled ? "default" : "outline"} disabled={!isAdmin} onClick={() => save(f.key, !f.enabled, f.rolloutPct, f.description)}>
                {f.enabled ? "On" : "Off"}
              </Button>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Revenue() {
  const r = useLoad<{
    snapshot: { mrrMinor: number; activeSubscriptions: number; activeSeats: number; churnPct: number };
    paidVehicles: number;
    unassignedSeats: number;
    collectedLast30DaysMinor: number;
    byStatus: { status: string; subscriptions: number; vehicles: number }[];
  }>(() => api.get("/admin/revenue"), []);
  if (r.error) return <Notice tone="danger">{r.error}</Notice>;
  const d = r.data;
  if (!d) return null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["MRR", inr(d.snapshot.mrrMinor)],
          ["Collected (30 days)", inr(d.collectedLast30DaysMinor)],
          ["Paid cars", `${d.paidVehicles} (${d.unassignedSeats} unassigned)`],
          ["30-day churn", `${d.snapshot.churnPct}%`]
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle title="Subscriptions by status" right={<RefreshCw className="h-4 w-4 cursor-pointer text-muted-foreground" onClick={r.reload} />} />
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Status</th>
              <th>Subscriptions</th>
              <th>Cars</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {d.byStatus.map((s) => (
              <tr key={s.status}>
                <td className="py-2">{s.status.replace("_", " ")}</td>
                <td className="tabular-nums">{s.subscriptions}</td>
                <td className="tabular-nums">{s.vehicles}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">MRR is the sum of active subscriptions' monthly charge (tax as configured). Payment totals include only captured/paid payments.</p>
      </Card>
    </div>
  );
}

function Audit() {
  const rows = useLoad<{ items: { id: string; actorId: string; action: string; subjectType: string; subjectId: string; metadata: unknown; createdAt: string }[] }>(() => api.get("/admin/audit"), []);
  return (
    <Card>
      <CardTitle title="Audit log" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2">When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Subject</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.data?.items.map((a) => (
              <tr key={a.id}>
                <td className="py-2">{formatDateTime(a.createdAt)}</td>
                <td className="font-mono">{a.actorId}</td>
                <td>{a.action}</td>
                <td className="font-mono">
                  {a.subjectType}:{a.subjectId}
                </td>
                <td className="max-w-xs truncate font-mono text-muted-foreground">{a.metadata ? JSON.stringify(a.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
