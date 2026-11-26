"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CalendarDays, CheckCircle2, MapPin, Plus, Ticket, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { PlaceSearch, type Place } from "@/components/drive/place-search";
import { LiveMap } from "@/components/map/live-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select, Tabs, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";

interface MeetupListItem {
  id: string;
  title: string;
  startsAt: string;
  venueName: string;
  city: string | null;
  capacity: number;
  status: string;
  host: { displayName: string };
  club: { name: string; slug: string } | null;
  _count?: { rsvps: number };
}

export function MeetupsView() {
  const { status, me } = useAuth();
  const { notify, view } = useToast();
  const [tab, setTab] = useState<"upcoming" | "mine">("upcoming");
  const [city, setCity] = useState("");
  const [filter, setFilter] = useState("");
  const list = useLoad<MeetupListItem[]>(status === "signed_in" ? () => api.get(`/meetups${filter ? `?city=${encodeURIComponent(filter)}` : ""}`) : null, [status, filter]);
  const mine = useLoad<{ hosting: MeetupListItem[]; attending: { status: string; meetup: MeetupListItem }[] }>(status === "signed_in" ? () => api.get("/meetups/mine") : null, [status]);
  const [hosting, setHosting] = useState(false);

  if (status === "signed_out") return <SignInPrompt what="find meetups" />;

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Meetups"
        title="Drive-ins, breakfast runs and track days"
        description="Every meetup is reviewed by KAAFILA before it goes live. RSVP with your car; check in at the venue with the host's code."
        actions={
          <Button onClick={() => setHosting(true)}>
            <Plus className="h-4 w-4" /> Host a meetup
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "upcoming", label: "Upcoming" },
          { id: "mine", label: "Mine" }
        ]}
      />
      {tab === "upcoming" ? (
        <>
          <div className="flex max-w-md gap-2">
            <Input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setFilter(city.trim())} placeholder="Filter by city" />
            <Button variant="outline" onClick={() => setFilter(city.trim())}>
              Filter
            </Button>
          </div>
          {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
          {list.data?.length === 0 ? <Empty>No upcoming meetups{filter ? ` in ${filter}` : ""}. Host the first one.</Empty> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.data?.map((m) => <MeetupCard key={m.id} m={m} />)}
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle title="Hosting" />
            {mine.data?.hosting.length === 0 ? <Empty>You aren't hosting anything.</Empty> : null}
            <ul className="grid gap-2 text-sm">
              {mine.data?.hosting.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <Link href={`/meetups/${m.id}`} className="hover:underline">
                    {m.title}
                  </Link>
                  <Badge variant={m.status === "published" ? "default" : m.status === "pending_review" ? "amber" : "neutral"}>{m.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle title="Attending" />
            {mine.data?.attending.length === 0 ? <Empty>No RSVPs yet.</Empty> : null}
            <ul className="grid gap-2 text-sm">
              {mine.data?.attending.map((a) => (
                <li key={a.meetup.id} className="flex items-center justify-between gap-2">
                  <Link href={`/meetups/${a.meetup.id}`} className="hover:underline">
                    {a.meetup.title}
                  </Link>
                  <Badge variant={a.status === "waitlist" ? "amber" : "default"}>{a.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {me ? <HostDialog open={hosting} onClose={() => setHosting(false)} notify={notify} onCreated={() => (mine.reload(), setTab("mine"))} /> : null}
      {view}
    </div>
  );
}

function MeetupCard({ m }: { m: MeetupListItem }) {
  const going = m._count?.rsvps ?? 0;
  return (
    <Link href={`/meetups/${m.id}`} className="glass-panel block rounded-lg p-4 transition hover:border-primary/40">
      <p className="text-xs text-primary">{formatDateTime(m.startsAt)}</p>
      <p className="mt-1 font-semibold">{m.title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> {m.venueName}
        {m.city ? `, ${m.city}` : ""}
      </p>
      <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {going}/{m.capacity}
        </span>
        <span>by {m.host.displayName}</span>
        {m.club ? <Badge variant="neutral">{m.club.name}</Badge> : null}
      </p>
    </Link>
  );
}

function HostDialog({ open, onClose, notify, onCreated }: { open: boolean; onClose: () => void; notify: (t: string, m?: string) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState<Place | null>(null);
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!venue) return notify("Pick the venue location");
    setBusy(true);
    try {
      await api.post("/meetups", {
        title,
        description,
        startsAt: new Date(startsAt).toISOString(),
        venueName: venueName || venue.name,
        address: venue.displayName,
        city: city || undefined,
        countryCode: venue.countryCode,
        lat: venue.position.lat,
        lng: venue.position.lng,
        capacity
      });
      notify("Submitted for review", "We'll publish it once it's approved.");
      onCreated();
      onClose();
    } catch (err) {
      notify("Couldn't submit", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Host a meetup" description="Meetups go live after a quick safety and content review.">
      <div className="grid gap-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Sunday sunrise coffee run" />
        </Field>
        <Field label="Description" hint="Route plan, rules (no racing on public roads), what to bring.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Capacity (people)">
            <Input type="number" min={2} max={5000} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </Field>
        </div>
        <PlaceSearch label="Venue location" value={venue} onChange={setVenue} useMyLocation />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue name">
            <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
          </Field>
        </div>
        <Button onClick={submit} disabled={busy || title.trim().length < 4 || description.trim().length < 10 || !startsAt}>
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </Modal>
  );
}

interface MeetupDetail {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  capacity: number;
  status: string;
  reviewNote: string | null;
  checkInCode?: string;
  going: number;
  waitlist: number;
  isHost: boolean;
  myRsvp: { status: string } | null;
  host: { displayName: string; handle: string | null };
  club: { name: string; slug: string } | null;
  attendees?: { id: string; status: string; user: { displayName: string } }[];
}

export function MeetupDetailView({ id }: { id: string }) {
  const { status, me } = useAuth();
  const { notify, view } = useToast();
  const meetup = useLoad<MeetupDetail>(status === "signed_in" ? () => api.get(`/meetups/${id}`) : null, [id, status]);
  const [code, setCode] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const c = meetup.data?.checkInCode;
    if (c) QRCode.toDataURL(c, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(null));
  }, [meetup.data?.checkInCode]);

  if (status === "signed_out") return <SignInPrompt what="see this meetup" />;
  if (meetup.error) return <Notice tone="danger">{meetup.error}</Notice>;
  const m = meetup.data;
  if (!m) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      meetup.reload();
    } catch (err) {
      notify("Something went wrong", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={m.club ? m.club.name : "Meetup"}
        title={m.title}
        description={`${formatDateTime(m.startsAt)} · ${m.venueName}${m.city ? `, ${m.city}` : ""} · hosted by ${m.host.displayName}`}
        actions={<Badge variant={m.status === "published" ? "default" : m.status === "pending_review" ? "amber" : "neutral"}>{m.status.replace("_", " ")}</Badge>}
      />
      {m.status === "rejected" && m.reviewNote ? <Notice tone="danger">Not approved: {m.reviewNote}</Notice> : null}
      {m.status === "pending_review" ? <Notice tone="warn">Waiting for review. Only you can see it until it's approved.</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-4">
          <Card>
            <p className="whitespace-pre-wrap text-sm">{m.description}</p>
            {m.address ? <p className="mt-3 text-xs text-muted-foreground">{m.address}</p> : null}
          </Card>
          <LiveMap vehicles={[]} pois={[{ id: m.id, name: m.venueName, lat: m.lat, lng: m.lng, category: "parking" }]} focus={{ lat: m.lat, lng: m.lng }} className="h-72" />
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardTitle eyebrow="Attendance" title={`${m.going}/${m.capacity} going`} right={m.waitlist ? <Badge variant="amber">{m.waitlist} waitlist</Badge> : null} />
            {m.myRsvp && m.myRsvp.status !== "cancelled" ? (
              <div className="grid gap-3">
                <Notice tone={m.myRsvp.status === "waitlist" ? "warn" : "ok"}>
                  {m.myRsvp.status === "checked_in" ? "You're checked in. Enjoy!" : m.myRsvp.status === "waitlist" ? "You're on the waitlist — we'll move you up if a spot opens." : "You're going."}
                </Notice>
                {m.myRsvp.status === "going" && !m.isHost ? (
                  <>
                    <Field label="Check-in code (from the host at the venue)">
                      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} className="font-mono uppercase tracking-widest" />
                    </Field>
                    <Button onClick={() => run(() => api.post(`/meetups/${id}/check-in`, { code }), "Checked in")} disabled={code.length !== 6}>
                      <CheckCircle2 className="h-4 w-4" /> Check in
                    </Button>
                  </>
                ) : null}
                {!m.isHost && m.myRsvp.status !== "checked_in" ? (
                  <Button variant="ghost" onClick={() => run(() => api.del(`/meetups/${id}/rsvp`), "RSVP cancelled")}>
                    Can't make it
                  </Button>
                ) : null}
              </div>
            ) : m.status === "published" ? (
              <div className="grid gap-3">
                {me?.vehicles.length ? (
                  <Field label="Bringing">
                    <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                      <option value="">No car / passenger</option>
                      {me.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <Button onClick={() => run(() => api.post(`/meetups/${id}/rsvp`, { vehicleId: vehicleId || undefined }), "RSVP saved")}>
                  <Ticket className="h-4 w-4" /> RSVP
                </Button>
              </div>
            ) : null}
          </Card>
          {m.isHost ? (
            <Card>
              <CardTitle eyebrow="Host tools" title="Check-in code" right={<CalendarDays className="h-4 w-4 text-muted-foreground" />} />
              <div className="flex items-center gap-4">
                {qr ? <img src={qr} alt="Check-in code QR" className="w-28 rounded bg-white p-1.5" /> : null}
                <p className="font-mono text-3xl font-semibold tracking-widest">{m.checkInCode}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Show this at the venue. Check-in opens 2 hours before the start.</p>
              <ul className="mt-3 grid max-h-64 gap-1 overflow-y-auto text-sm">
                {m.attendees?.map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <span>{a.user.displayName}</span>
                    <Badge variant={a.status === "checked_in" ? "default" : a.status === "waitlist" ? "amber" : "neutral"}>{a.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
              {m.status !== "cancelled" ? (
                <Button variant="ghost" className="mt-3" onClick={() => window.confirm("Cancel this meetup for everyone?") && run(() => api.post(`/meetups/${id}/cancel`), "Meetup cancelled")}>
                  Cancel meetup
                </Button>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
      {view}
    </div>
  );
}
