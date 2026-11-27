"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Mic, MicOff, Repeat, Send, Square, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ConvoySummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createRecognition, recognitionSupported, SentenceSpeaker, streamAnswer } from "@/lib/voice";

type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGEST_SIGNED_IN = ["Who needs fuel first and where do we stop?", "Is anyone due for a break?", "Nearest hospital", "What do I do with a flat tyre?"];
const SUGGEST_HELP = ["What is KAAFILA?", "How does the ₹500 per car plan work?", "How do I connect an OBD adapter?", "What should I do after an accident?"];

const TOOL_LABEL: Record<string, string> = {
  get_convoy_status: "checking the convoy",
  get_convoy_intel: "reading convoy intelligence",
  find_nearby_services: "searching nearby",
  get_route_weather: "checking the weather",
  get_emergency_info: "looking up emergency numbers",
  get_breakdown_guide: "opening the roadside guide",
  get_vehicle_care: "checking your garage"
};

export function VoiceMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, token } = useAuth();
  const signedIn = status === "signed_in";
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFree] = useState(true);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [latency, setLatency] = useState<{ firstWord?: number; firstAudio?: number; total?: number } | null>(null);
  const [convoys, setConvoys] = useState<ConvoySummary[]>([]);
  const [convoyId, setConvoyId] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  const recRef = useRef<ReturnType<typeof createRecognition>>(null);
  const speakerRef = useRef<SentenceSpeaker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const askRef = useRef<(m: string) => Promise<void>>(async () => undefined);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const canListen = typeof window !== "undefined" && recognitionSupported();

  useEffect(() => {
    if (!open) return;
    setTyping(!recognitionSupported());
    navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { timeout: 8000, maximumAge: 60_000 });
    if (signedIn) {
      api
        .get<ConvoySummary[]>("/convoys/mine")
        .then((list) => {
          const active = list.filter((c) => !["completed", "cancelled"].includes(c.status));
          setConvoys(active);
          setConvoyId((id) => id || active[0]?.id || "");
        })
        .catch(() => undefined);
    }
  }, [open, signedIn]);

  const stopAll = useCallback(() => {
    abortRef.current?.abort();
    speakerRef.current?.stop();
    recRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) {
      stopAll();
      setPhase("idle");
    }
  }, [open, stopAll]);

  const listen = useCallback(() => {
    setError(null);
    speakerRef.current?.stop();
    abortRef.current?.abort();
    setTranscript("");
    const rec = createRecognition({
      onInterim: setTranscript,
      onFinal: (t) => void askRef.current(t),
      onEnd: () => setPhase((p) => (p === "listening" ? "idle" : p)),
      onError: (e) => e && setError(e)
    });
    if (!rec) {
      setTyping(true);
      return;
    }
    recRef.current = rec;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, []);

  const ask = useCallback(
    async (message: string) => {
      const question = message.trim();
      if (!question) return;
      recRef.current?.abort();
      abortRef.current?.abort();
      speakerRef.current?.stop();

      const controller = new AbortController();
      abortRef.current = controller;
      const speaker = new SentenceSpeaker();
      speakerRef.current = speaker;
      const t0 = performance.now();
      const lat: { firstWord?: number; firstAudio?: number; total?: number } = {};
      speaker.onFirstAudio = () => {
        lat.firstAudio = Math.round(performance.now() - t0);
        setLatency({ ...lat });
        setPhase("speaking");
      };
      speaker.onIdle = () => {
        if (controller.signal.aborted) return;
        setPhase("idle");
        if (handsFreeRef.current && recognitionSupported()) window.setTimeout(listen, 350);
      };

      setTranscript(question);
      setAnswer("");
      setActivity(null);
      setError(null);
      setPhase("thinking");
      setLatency(null);
      let full = "";
      const history = turns.slice(-6);
      setTurns((t) => [...t, { role: "user", content: question }]);

      try {
        await streamAnswer(
          signedIn ? "/assistant/stream" : "/assistant/help/stream",
          signedIn ? { message: question, voice: true, convoyId: convoyId || undefined, lat: pos?.lat, lng: pos?.lng } : { message: question, voice: true, history },
          signedIn ? token : null,
          {
            onDelta: (d) => {
              if (lat.firstWord === undefined) {
                lat.firstWord = Math.round(performance.now() - t0);
                setLatency({ ...lat });
              }
              full += d;
              setAnswer(full);
              setActivity(null);
              speaker.feed(d);
            },
            onTool: (name) => setActivity(TOOL_LABEL[name] ?? "checking"),
            onDone: (d) => {
              lat.total = Math.round(performance.now() - t0);
              setLatency({ ...lat });
              if (d.upgradeHint) setActivity(d.upgradeHint);
            },
            onError: (m) => setError(m)
          },
          controller.signal
        );
        setTurns((t) => [...t, { role: "assistant", content: full }]);
        speaker.finish();
        if (!SentenceSpeaker.supported()) setPhase("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "The assistant is unavailable");
        setPhase("idle");
      }
    },
    [signedIn, token, convoyId, pos, turns, listen]
  );
  askRef.current = ask;

  const orbAction = () => {
    if (phase === "listening") {
      recRef.current?.stop();
      return;
    }
    if (phase === "thinking" || phase === "speaking") {
      // Interrupt and listen again.
      stopAll();
      setPhase("idle");
      if (canListen) window.setTimeout(listen, 150);
      return;
    }
    if (canListen) listen();
    else setTyping(true);
  };

  if (!open) return null;

  const label =
    phase === "listening" ? "Listening…" : phase === "thinking" ? activity ? `${activity[0]!.toUpperCase()}${activity.slice(1)}…` : "Thinking…" : phase === "speaking" ? "Speaking — tap to interrupt" : canListen ? "Tap the orb and speak" : "Type your question";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#04060b]/95 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="KAAFILA voice mode">
      <div className="aurora pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm uppercase tracking-[0.3em] text-cyan-200">Kaafila · Voice</span>
          {signedIn ? (
            <select
              value={convoyId}
              onChange={(e) => setConvoyId(e.target.value)}
              className="h-8 rounded-full border border-white/15 bg-white/5 px-3 text-xs text-white outline-none"
              aria-label="Conversation context"
            >
              <option value="">General co-pilot</option>
              {convoys.map((c) => (
                <option key={c.id} value={c.id}>
                  Convoy: {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground">App help · sign in for your convoy</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/15 p-2 text-white hover:bg-white/10" aria-label="Close voice mode">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <button type="button" onClick={orbAction} className={cn("voice-orb", `voice-orb--${phase}`)} aria-label={label}>
          <span className="voice-orb__core" />
          <span className="voice-orb__ring" />
          <span className="voice-orb__ring voice-orb__ring--2" />
          {phase === "listening" ? <Mic className="relative h-10 w-10 text-white" /> : phase === "speaking" || phase === "thinking" ? <Square className="relative h-8 w-8 text-white/90" /> : <Mic className="relative h-10 w-10 text-white/90" />}
        </button>
        <p className="font-display text-sm uppercase tracking-[0.25em] text-cyan-100/90" aria-live="polite">
          {label}
        </p>

        <div className="w-full max-w-2xl space-y-3 text-center">
          {transcript ? <p className="text-lg text-white/70">“{transcript}”</p> : null}
          {answer ? <p className="text-xl leading-relaxed text-white sm:text-2xl">{answer}</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {!transcript && !answer ? (
            <div className="flex flex-wrap justify-center gap-2">
              {(signedIn ? SUGGEST_SIGNED_IN : SUGGEST_HELP).map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5 text-sm text-cyan-50 hover:bg-cyan-300/15">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="relative z-10 grid gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {latency ? (
          <p className="flex items-center justify-center gap-3 font-mono text-[11px] text-cyan-200/80">
            <Zap className="h-3.5 w-3.5" />
            {latency.firstWord !== undefined ? <span>first word {latency.firstWord} ms</span> : null}
            {latency.firstAudio !== undefined ? <span>first audio {latency.firstAudio} ms</span> : null}
            {latency.total !== undefined ? <span>complete {(latency.total / 1000).toFixed(1)} s</span> : null}
          </p>
        ) : null}
        {typing ? (
          <form
            className="mx-auto flex w-full max-w-2xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
              setText("");
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about your convoy, KAAFILA or roadside help" className="h-12 flex-1 rounded-full border border-white/15 bg-white/5 px-5 text-white outline-none focus:border-cyan-300/60" maxLength={600} autoFocus />
            <button type="submit" className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400 text-black" aria-label="Send">
              <Send className="h-5 w-5" />
            </button>
          </form>
        ) : null}
        <div className="flex items-center justify-center gap-2 text-xs">
          {canListen ? (
            <button type="button" onClick={() => setHandsFree((v) => !v)} aria-pressed={handsFree} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5", handsFree ? "border-cyan-300/50 text-cyan-100" : "border-white/15 text-muted-foreground")}>
              <Repeat className="h-3.5 w-3.5" /> Hands-free {handsFree ? "on" : "off"}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-muted-foreground">
              <MicOff className="h-3.5 w-3.5" /> Voice input isn't supported in this browser
            </span>
          )}
          <button type="button" onClick={() => setTyping((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-muted-foreground hover:text-white">
            <Keyboard className="h-3.5 w-3.5" /> {typing ? "Hide keyboard" : "Type instead"}
          </button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Driving? Keep your eyes on the road. In an emergency, call your local emergency number first.</p>
      </footer>
    </div>
  );
}
