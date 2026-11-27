"use client";

import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useLocalParticipant, useParticipants } from "@livekit/components-react";
import { Headphones, Mic, MicOff, PhoneOff, Radio, ShieldAlert, Users, Video } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFeature } from "@/lib/flags";
import { useLoad } from "@/lib/hooks";
import type { ConvoySummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Notice } from "@/components/ui/field";

interface Session {
  wsUrl: string;
  room: string;
  token: string;
  channel: { id: string; name: string; type: string };
  video: boolean;
  audioOnlyReason: string | null;
  title: string;
}

interface ClubRow {
  club: { id: string; name: string; slug: string };
}

export function CallsView() {
  const { status } = useAuth();
  const enabled = useFeature("group_calls");
  const callStatus = useLoad<{ enabled: boolean }>(status === "signed_in" ? () => api.get("/voice/status") : null, [status]);
  const convoys = useLoad<ConvoySummary[]>(status === "signed_in" ? () => api.get("/convoys/mine") : null, [status]);
  const clubs = useLoad<ClubRow[]>(status === "signed_in" ? () => api.get("/social/clubs/mine") : null, [status]);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  if (status === "signed_out") return <SignInPrompt what="join group calls" />;
  if (!enabled) return <Notice tone="info">Group calls are rolling out gradually and aren't enabled for your account yet.</Notice>;

  const active = (convoys.data ?? []).filter((c) => !["completed", "cancelled"].includes(c.status));

  const join = async (key: string, path: string, title: string) => {
    setJoining(key);
    setError(null);
    try {
      const s = await api.post<Omit<Session, "title">>(path);
      setSession({ ...s, title });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Calls" title="Group voice & video" description="Convoy channels keep drivers on voice with push-to-talk; passengers and club lounges can go full video." />
      {callStatus.data && !callStatus.data.enabled ? <Notice tone="warn">Calls aren't configured on this server yet (LiveKit). Ask your administrator to set LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_WS_URL.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <Card>
            <CardTitle eyebrow="Convoy channels" title="On the road" right={<Radio className="h-4 w-4 text-primary" />} />
            {active.length === 0 ? <Empty>No live convoys. Create or join one on the Drive page.</Empty> : null}
            <div className="grid gap-2">
              {active.map((c) =>
                (["main", "leaders", "emergency"] as const).map((type) => {
                  const key = `${c.id}:${type}`;
                  return (
                    <ChannelButton
                      key={key}
                      title={`${c.name}`}
                      subtitle={type === "main" ? "Main channel" : type === "leaders" ? "Leaders only" : "Emergency"}
                      busy={joining === key}
                      onClick={async () => {
                        try {
                          const channels = await api.get<{ id: string; channelType: string }[]>(`/voice/convoys/${c.id}/channels`);
                          const ch = channels.find((x) => x.channelType === type);
                          await join(key, `/voice/convoys/${c.id}/livekit-token${ch ? `?channelId=${ch.id}` : ""}`, `${c.name} · ${type}`);
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                      tone={type === "emergency" ? "danger" : "default"}
                    />
                  );
                })
              )}
            </div>
          </Card>
          <Card>
            <CardTitle eyebrow="Club lounges" title="Off the road" right={<Users className="h-4 w-4 text-secondary" />} />
            {clubs.data?.length === 0 ? <Empty>Join a club in Community to get its lounge.</Empty> : null}
            <div className="grid gap-2">
              {clubs.data?.map((m) => (
                <ChannelButton key={m.club.id} title={m.club.name} subtitle="Lounge · video + screen share" busy={joining === m.club.id} onClick={() => join(m.club.id, `/voice/clubs/${m.club.id}/livekit-token`, `${m.club.name} lounge`)} />
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          {session ? (
            <CallStage session={session} onLeave={() => setSession(null)} />
          ) : (
            <Card className="hud-corners flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <Headphones className="h-10 w-10 text-primary" />
              <p className="font-display text-lg">Pick a channel to join</p>
              <p className="max-w-md text-sm text-muted-foreground">Voice is end-to-end over WebRTC through LiveKit. Your mic starts muted; hold to talk in convoy channels.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelButton({ title, subtitle, onClick, busy, tone = "default" }: { title: string; subtitle: string; onClick: () => void; busy?: boolean; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition",
        tone === "danger" ? "border-rose-400/25 hover:bg-rose-500/10" : "border-white/10 hover:border-cyan-300/40 hover:bg-cyan-300/5"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span className="text-xs text-primary">{busy ? "Joining…" : "Join"}</span>
    </button>
  );
}

function CallStage({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="hud-label">Live call</p>
          <p className="font-display truncate font-semibold">{session.title}</p>
        </div>
        <div className="flex items-center gap-2">
          {session.video ? <Badge><Video className="mr-1 h-3 w-3" />video</Badge> : <Badge variant="amber"><Mic className="mr-1 h-3 w-3" />voice only</Badge>}
        </div>
      </div>
      {session.audioOnlyReason ? (
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          <ShieldAlert className="h-4 w-4" /> {session.audioOnlyReason}
        </div>
      ) : null}
      {error ? <Notice tone="danger" className="m-3">{error}</Notice> : null}
      <LiveKitRoom
        serverUrl={session.wsUrl}
        token={session.token}
        connect
        audio={false}
        video={false}
        onDisconnected={onLeave}
        onError={(e) => setError(e.message)}
        data-lk-theme="default"
        className="min-h-[480px]"
        style={{ height: session.video ? "70vh" : "auto" }}
      >
        {session.video ? <VideoConference /> : <PushToTalkRoom onLeave={onLeave} />}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </Card>
  );
}

/** Audio-only convoy room: big hold-to-talk button and live speaking indicators. */
function PushToTalkRoom({ onLeave }: { onLeave: () => void }) {
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [holding, setHolding] = useState(false);
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    void localParticipant.setMicrophoneEnabled(holding || latched);
  }, [holding, latched, localParticipant]);

  return (
    <div className="grid gap-4 p-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {participants.map((p) => (
          <li key={p.identity} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition", p.isSpeaking ? "border-cyan-300/60 bg-cyan-300/10 neon-glow" : "border-white/10")}>
            <span className="truncate">
              {p.name || p.identity}
              {p.isLocal ? " (you)" : ""}
            </span>
            {p.isMicrophoneEnabled ? <Mic className={cn("h-4 w-4", p.isSpeaking ? "text-cyan-300" : "text-muted-foreground")} /> : <MicOff className="h-4 w-4 text-muted-foreground" />}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "mx-auto flex h-40 w-40 select-none flex-col items-center justify-center gap-2 rounded-full border-2 text-sm font-semibold transition",
          isMicrophoneEnabled ? "border-cyan-300 bg-cyan-400/20 text-cyan-50 shadow-[0_0_60px_rgba(34,211,238,0.5)]" : "border-white/20 bg-white/5 text-white"
        )}
        aria-pressed={isMicrophoneEnabled}
      >
        <Radio className="h-8 w-8" />
        {isMicrophoneEnabled ? "Talking…" : "Hold to talk"}
      </button>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant={latched ? "secondary" : "outline"} onClick={() => setLatched((v) => !v)}>
          {latched ? "Open mic on" : "Open mic"}
        </Button>
        <Button size="sm" variant="destructive" onClick={onLeave}>
          <PhoneOff className="h-4 w-4" /> Leave
        </Button>
      </div>
    </div>
  );
}
