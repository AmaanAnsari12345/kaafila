"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Crown, Link2, Send, Share2, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import { formatDistance, type ChatMessageEvent, type ConvoyIntelReport, type LiveVehicleState, type QuickSignalEvent } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import type { ConvoyDetail, KittySummary } from "@/lib/types";
import { cn, formatKph, inr, shareOrCopy, timeAgo, timeUntil } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select } from "@/components/ui/field";

/* ------------------------------------------------------------------ */
/* Roster                                                             */
/* ------------------------------------------------------------------ */

export function RosterPanel({
  detail,
  live,
  intel,
  myUserId,
  canCommand,
  onChanged,
  notify
}: {
  detail: ConvoyDetail | null;
  live: Record<string, LiveVehicleState>;
  intel: ConvoyIntelReport | null;
  myUserId?: string;
  canCommand: boolean;
  onChanged: () => void;
  notify: (t: string, m?: string) => void;
}) {
  if (!detail) return <Card><p className="text-sm text-muted-foreground">Loading members…</p></Card>;
  const gapFor = (vehicleId: string | null) => (vehicleId ? intel?.formation.entries.find((e) => e.vehicleId === vehicleId) : undefined);

  const act = async (userId: string, action: "leader" | "sweeper" | "driver" | "remove") => {
    try {
      if (action === "remove") await api.del(`/convoys/${detail.id}/members/${userId}`);
      else await api.patch(`/convoys/${detail.id}/members/${userId}`, { role: action });
      notify("Convoy updated");
      onChanged();
    } catch (err) {
      notify("Couldn't update member", errorMessage(err));
    }
  };

  return (
    <Card>
      <CardTitle eyebrow="Members" title={`${detail.members.length} in convoy`} />
      <ul className="grid gap-2">
        {detail.members.map((m) => {
          const v = m.vehicleId ? live[m.vehicleId] : undefined;
          const entry = gapFor(m.vehicleId);
          return (
            <li key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{m.user.displayName}</span>
                    {m.userId === myUserId ? <Badge variant="neutral">you</Badge> : null}
                    <Badge variant={m.role === "leader" || m.role === "owner" ? "amber" : "neutral"}>{m.role}</Badge>
                    {m.plan !== "explorer" ? <Badge>Drive</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.vehicle ? `${m.vehicle.name}${m.vehicle.plateNumber ? ` · ${m.vehicle.plateNumber}` : ""}` : "No car (follower)"}</p>
                </div>
                {v ? <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatKph(v.speedKph)}<br />{timeAgo(v.capturedAtIso)}</span> : null}
              </div>
              {entry ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Position {entry.order}
                  {entry.gapAheadMeters !== null ? ` · ${formatDistance(entry.gapAheadMeters)} behind the car ahead` : " · leading"}
                  {entry.offRoute ? " · off route" : ""}
                </p>
              ) : null}
              {canCommand && m.role !== "owner" && m.userId !== myUserId ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.vehicleId && m.role !== "leader" ? (
                    <Button size="sm" variant="outline" onClick={() => act(m.userId, "leader")}>
                      <Crown className="h-3.5 w-3.5" /> Make leader
                    </Button>
                  ) : null}
                  {m.vehicleId && m.role !== "sweeper" ? (
                    <Button size="sm" variant="outline" onClick={() => act(m.userId, "sweeper")}>
                      <ShieldCheck className="h-3.5 w-3.5" /> Sweeper
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => act(m.userId, "remove")}>
                    <UserMinus className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Chat + signal feed                                                 */
/* ------------------------------------------------------------------ */

export function ChatPanel({
  convoyId,
  live,
  signals,
  onSend,
  moving
}: {
  convoyId: string;
  live: ChatMessageEvent[];
  signals: QuickSignalEvent[];
  onSend: (body: string) => Promise<void>;
  moving: boolean;
}) {
  const [history, setHistory] = useState<{ id: string; kind: string; body: string; displayName: string; createdAtIso: string }[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (convoyId === "demo") return;
    api.get<typeof history>(`/convoys/${convoyId}/messages`).then(setHistory).catch(() => undefined);
  }, [convoyId]);

  const items = useMemo(() => {
    const map = new Map<string, { id: string; kind: string; body: string; displayName: string; createdAtIso: string }>();
    for (const h of history) map.set(h.id, h);
    for (const c of live) map.set(c.id, { id: c.id, kind: "text", body: c.body, displayName: c.displayName, createdAtIso: c.createdAtIso });
    for (const s of signals) if (!map.has(s.id)) map.set(s.id, { id: s.id, kind: "quick_signal", body: `${s.displayName}: ${s.code.replaceAll("_", " ")}`, displayName: s.displayName, createdAtIso: s.createdAtIso });
    return [...map.values()].sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso)).slice(-150);
  }, [history, live, signals]);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [items.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await onSend(body);
      setText("");
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card className="flex h-[520px] flex-col">
      <CardTitle eyebrow="Convoy chat" title="Messages & signals" />
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? <Empty>No messages yet. Quick signals appear here too.</Empty> : null}
        {items.map((m) => (
          <div key={m.id} className={cn("rounded-lg px-3 py-2 text-sm", m.kind === "quick_signal" ? "border border-amber-400/20 bg-amber-400/10" : "bg-white/[0.05]")}>
            <p className="text-xs text-muted-foreground">
              {m.displayName} · {timeAgo(m.createdAtIso)}
            </p>
            <p>{m.body}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {moving ? <Notice tone="warn" className="mt-2">You're moving. Use quick signals or let your navigator type.</Notice> : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder="Message the convoy" maxLength={500} disabled={moving} />
        <Button size="icon" onClick={send} disabled={moving || !text.trim()} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Kitty                                                              */
/* ------------------------------------------------------------------ */

const CATEGORIES = ["fuel", "toll", "food", "stay", "parking", "repair", "activity", "other"] as const;

export function KittyPanel({ convoyId, version, myUserId, notify }: { convoyId: string; version: number; myUserId?: string; notify: (t: string, m?: string) => void }) {
  const [summary, setSummary] = useState<KittySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("fuel");
  const [split, setSplit] = useState<"equal" | "by_car">("equal");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<KittySummary>(`/kitty/convoys/${convoyId}`)
      .then((s) => (setSummary(s), setError(null)))
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoyId, version]);

  const add = async () => {
    const rupees = Number(amount);
    if (!title.trim() || !Number.isFinite(rupees) || rupees <= 0) return notify("Enter what it was for and the amount");
    setBusy(true);
    try {
      await api.post(`/kitty/convoys/${convoyId}/expenses`, { title: title.trim(), category, amountMinor: Math.round(rupees * 100), splitMode: split });
      setTitle("");
      setAmount("");
      await load();
      notify("Expense added", "Balances updated for everyone.");
    } catch (err) {
      notify("Couldn't add expense", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/kitty/convoys/${convoyId}/expenses/${id}`);
      await load();
    } catch (err) {
      notify("Couldn't delete", errorMessage(err));
    }
  };

  if (error) return <Card><Notice tone="danger">{error}</Notice></Card>;
  if (!summary) return <Card><p className="text-sm text-muted-foreground">Loading kitty…</p></Card>;

  return (
    <div className="grid gap-3">
      <Card>
        <CardTitle eyebrow="Kitty" title={`Trip spend ${inr(summary.totalMinor)}`} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="What for">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diesel at the plaza" maxLength={80} />
          </Field>
          <Field label="Amount (₹)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="2400" />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Split">
            <Select value={split} onChange={(e) => setSplit(e.target.value as typeof split)}>
              <option value="equal">Equally between everyone</option>
              <option value="by_car">Equally per car (drivers pay)</option>
            </Select>
          </Field>
        </div>
        <Button className="mt-3 w-full" onClick={add} disabled={busy}>
          {busy ? "Adding…" : "Add expense (I paid)"}
        </Button>
      </Card>

      <Card>
        <CardTitle eyebrow="Settle up" title={summary.transfers.length ? `${summary.transfers.length} payments settle everything` : "All square"} />
        <ul className="grid gap-2 text-sm">
          {summary.transfers.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-2">
              <span>
                <span className="font-medium">{t.fromName}</span> pays <span className="font-medium">{t.toName}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{inr(t.amountMinor)}</span>
                {t.upiLink && t.fromUserId === myUserId ? (
                  <a href={t.upiLink} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                    Pay via UPI
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {summary.transfers.some((t) => !t.upiLink) ? <p className="mt-2 text-xs text-muted-foreground">Add your UPI ID in Profile so others can pay you in one tap.</p> : null}
      </Card>

      <Card>
        <CardTitle eyebrow="History" title="Expenses" />
        {summary.expenses.length === 0 ? <Empty>No expenses yet.</Empty> : null}
        <ul className="grid gap-1.5 text-sm">
          {summary.expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate">{e.title}</span>
                <span className="text-xs text-muted-foreground">
                  {e.category} · {e.paidByName} · {e.splitMode === "by_car" ? "per car" : "equal"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {inr(e.amountMinor)}
                {e.paidById === myUserId ? (
                  <button type="button" onClick={() => remove(e.id)} className="text-muted-foreground hover:text-rose-300" aria-label={`Delete ${e.title}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite + family follow                                             */
/* ------------------------------------------------------------------ */

export function SharePanel({ detail, notify }: { detail: ConvoyDetail; notify: (t: string, m?: string) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [hours, setHours] = useState(12);
  const [links, setLinks] = useState<{ id: string; label: string | null; expiresAt: string; viewCount: number }[]>([]);
  const [lastLink, setLastLink] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(detail.joinUrl, { margin: 1, width: 240, color: { dark: "#0b1010", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
    api.get<typeof links>(`/convoys/${detail.id}/share-links`).then(setLinks).catch(() => undefined);
  }, [detail.id, detail.joinUrl]);

  const createLink = async () => {
    try {
      const res = await api.post<{ url: string }>(`/convoys/${detail.id}/share-links`, { hours, label: "Family" });
      setLastLink(res.url);
      setLinks(await api.get<typeof links>(`/convoys/${detail.id}/share-links`));
      const r = await shareOrCopy(`Follow ${detail.name} live`, res.url);
      notify("Family link ready", r === "copied" ? "Copied to clipboard." : r === "shared" ? "Shared." : res.url);
    } catch (err) {
      notify("Couldn't create link", errorMessage(err));
    }
  };

  const revoke = async (id: string) => {
    await api.del(`/convoys/${detail.id}/share-links/${id}`).catch(() => undefined);
    setLinks((l) => l.filter((x) => x.id !== id));
  };

  return (
    <div className="grid gap-3">
      <Card>
        <CardTitle eyebrow="Invite" title="Bring cars in" />
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          {qr ? <img src={qr} alt={`QR code for invite ${detail.inviteCode}`} className="w-full max-w-[180px] rounded-lg bg-white p-2" /> : <div className="aspect-square rounded-lg bg-white/5" />}
          <div className="grid content-start gap-2">
            <p className="text-xs text-muted-foreground">Invite code</p>
            <p className="font-mono text-2xl font-semibold">{detail.inviteCode}</p>
            <p className="break-all text-xs text-muted-foreground">{detail.joinUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  const r = await shareOrCopy(`Join ${detail.name} on KAAFILA`, detail.joinUrl);
                  notify(r === "shared" ? "Invite shared" : r === "copied" ? "Invite link copied" : "Couldn't share");
                }}
              >
                <Share2 className="h-4 w-4" /> Share invite
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(detail.inviteCode).then(() => notify("Code copied"))}>
                <Copy className="h-4 w-4" /> Copy code
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle eyebrow="Family follow" title="Live link for people at home" />
        <p className="text-sm text-muted-foreground">A read-only page with the convoy's positions. No app or account needed. Expires automatically; revoke any time.</p>
        <div className="mt-3 flex items-end gap-2">
          <Field label="Valid for" className="flex-1">
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[2, 6, 12, 24, 48, 72].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={createLink}>
            <Link2 className="h-4 w-4" /> Create link
          </Button>
        </div>
        {lastLink ? <p className="mt-2 break-all text-xs text-primary">{lastLink}</p> : null}
        {links.length ? (
          <ul className="mt-3 grid gap-1.5 text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                <span>
                  {l.label ?? "Link"} · {l.viewCount} views · expires {timeUntil(l.expiresAt)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
