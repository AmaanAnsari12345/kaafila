"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { GeoPoint } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad, useSpeech } from "@/lib/hooks";
import type { ConvoySummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Input, Notice, Select } from "@/components/ui/field";

interface Answer {
  answer: string;
  mode: "ai" | "rules";
  model?: string;
  toolsUsed: string[];
  upgradeHint?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  meta?: Omit<Answer, "answer">;
}

const SUGGESTIONS = [
  "Who in the convoy runs out of fuel first, and where should we stop?",
  "Where should we regroup?",
  "Is anyone due for a break?",
  "Nearest hospital",
  "Flat tyre — what do I do?",
  "Weather on the way",
  "Is my insurance or service due?"
];

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
}

export function CopilotView() {
  const { status, me } = useAuth();
  const convoys = useLoad<ConvoySummary[]>(status === "signed_in" ? () => api.get("/convoys/mine") : null, [status]);
  const [convoyId, setConvoyId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<GeoPoint | null>(null);
  const [listening, setListening] = useState(false);
  const { speak, enabled: voiceOn, setEnabled: setVoiceOn } = useSpeech();
  const end = useRef<HTMLDivElement>(null);

  const active = (convoys.data ?? []).filter((c) => c.status !== "completed" && c.status !== "cancelled");
  useEffect(() => {
    if (!convoyId && active[0]) setConvoyId(active[0].id);
  }, [active, convoyId]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { timeout: 10_000 });
  }, []);

  useEffect(() => {
    if (status !== "signed_in") return;
    api
      .get<{ role: string; content: string }[]>(`/assistant/history${convoyId ? `?convoyId=${convoyId}` : ""}`)
      .then((h) => setTurns(h.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content }))))
      .catch(() => undefined);
  }, [convoyId, status]);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [turns.length, busy]);

  const ask = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setTurns((t) => [...t, { role: "user", content: m }]);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Answer>("/assistant/ask", { message: m, convoyId: convoyId || undefined, lat: pos?.lat, lng: pos?.lng });
      const { answer, ...meta } = res;
      setTurns((t) => [...t, { role: "assistant", content: answer, meta }]);
      speak(answer);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setError("Voice input isn't supported in this browser.");
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said) void ask(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  if (status === "signed_out") return <SignInPrompt what="talk to your co-pilot" />;

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Co-pilot"
        title="Ask about your convoy"
        description="Grounded in your convoy's live formation, fuel range, fatigue, weather, nearby services and your garage. Short, spoken-friendly answers."
        actions={
          <>
            <Select value={convoyId} onChange={(e) => setConvoyId(e.target.value)} className="h-9 w-60" aria-label="Convoy context">
              <option value="">No convoy (general)</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => setVoiceOn(!voiceOn)} aria-pressed={voiceOn}>
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {voiceOn ? "Speaking" : "Muted"}
            </Button>
          </>
        }
      />
      {me?.plan === "explorer" ? (
        <Notice tone="info">
          On Explorer you get quick rule-based answers. The full AI co-pilot comes with <Link href="/billing" className="underline">KAAFILA Drive</Link> (₹500 per car per month).
        </Notice>
      ) : null}
      <Card className="flex h-[65vh] min-h-[420px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {turns.length === 0 ? (
            <div className="grid gap-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-amber-300" /> Try one of these:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-white/10 px-3 py-1.5 text-left text-sm hover:bg-white/10">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {turns.map((t, i) => (
            <div key={i} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", t.role === "user" ? "ml-auto bg-primary/20" : "bg-white/[0.06]")}>
              <p className="whitespace-pre-wrap">{t.content}</p>
              {t.meta ? (
                <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  <Badge variant="neutral">{t.meta.mode === "ai" ? "AI" : "quick answer"}</Badge>
                  {t.meta.toolsUsed.length ? <span>checked: {[...new Set(t.meta.toolsUsed)].join(", ").replaceAll("_", " ")}</span> : null}
                  {t.meta.upgradeHint ? <span>· {t.meta.upgradeHint}</span> : null}
                </p>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-muted-foreground">Checking the convoy…</p> : null}
          <div ref={end} />
        </div>
        {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
        <div className="mt-3 flex gap-2">
          <Button size="icon" variant={listening ? "destructive" : "outline"} onClick={listen} aria-label="Ask by voice" title="Ask by voice">
            <Mic className="h-4 w-4" />
          </Button>
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask(text)} placeholder="Ask your co-pilot…" maxLength={1000} />
          <Button size="icon" onClick={() => ask(text)} disabled={busy || !text.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Driving? Use the mic or let a passenger type. In an emergency call your local emergency number first.</p>
      </Card>
    </div>
  );
}
