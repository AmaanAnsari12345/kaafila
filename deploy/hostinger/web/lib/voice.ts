"use client";

import { webConfig } from "./config";

/* ------------------------------------------------------------------ */
/* Streaming answers (Server-Sent Events over POST)                    */
/* ------------------------------------------------------------------ */

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onTool?: (name: string) => void;
  onMeta?: (meta: { firstTokenMs?: number | null }) => void;
  onDone?: (done: { mode: "ai" | "rules"; model?: string; toolsUsed: string[]; upgradeHint?: string; totalMs?: number }) => void;
  onError?: (message: string) => void;
}

export async function streamAnswer(path: string, body: unknown, token: string | null, handlers: StreamHandlers, signal: AbortSignal) {
  const res = await fetch(`${webConfig.apiBaseUrl}/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message || "The assistant is unavailable");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (event === "delta") handlers.onDelta(String(parsed.text ?? ""));
      else if (event === "tool") handlers.onTool?.(String(parsed.name ?? ""));
      else if (event === "meta") handlers.onMeta?.(parsed as { firstTokenMs?: number | null });
      else if (event === "done") handlers.onDone?.(parsed as never);
      else if (event === "error") handlers.onError?.(String(parsed.message ?? "Something went wrong"));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sentence-by-sentence speech: speak the first sentence while the     */
/* rest of the answer is still streaming in.                           */
/* ------------------------------------------------------------------ */

export class SentenceSpeaker {
  private pending = "";
  private queued = 0;
  private stopped = false;
  private voice: SpeechSynthesisVoice | null = null;
  onFirstAudio?: () => void;
  onIdle?: () => void;
  private started = false;

  constructor(private readonly lang = typeof navigator !== "undefined" ? navigator.language : "en-IN") {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      const base = this.lang.split("-")[0];
      this.voice =
        voices.find((v) => v.lang === this.lang && /natural|neural|google|premium/i.test(v.name)) ??
        voices.find((v) => v.lang === this.lang) ??
        voices.find((v) => v.lang.startsWith(`${base}-`)) ??
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  static supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  feed(text: string) {
    if (this.stopped) return;
    this.pending += text;
    // Speak complete sentences (or long clauses) as soon as they exist.
    const re = /^([\s\S]*?[.!?…](?=\s|$)|[\s\S]{140,}?[,;:](?=\s))/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.pending))) {
      const chunk = m[1]!.trim();
      this.pending = this.pending.slice(m[0].length);
      if (chunk) this.say(chunk);
    }
  }

  finish() {
    const rest = this.pending.trim();
    this.pending = "";
    if (rest) this.say(rest);
    else if (this.queued === 0) this.onIdle?.();
  }

  stop() {
    this.stopped = true;
    this.pending = "";
    this.queued = 0;
    if (SentenceSpeaker.supported()) window.speechSynthesis.cancel();
  }

  private say(text: string) {
    if (!SentenceSpeaker.supported()) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, ""));
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? this.lang;
    u.rate = 1.06;
    u.onstart = () => {
      if (!this.started) {
        this.started = true;
        this.onFirstAudio?.();
      }
    };
    const done = () => {
      this.queued = Math.max(0, this.queued - 1);
      if (this.queued === 0 && !this.pending && !this.stopped) this.onIdle?.();
    };
    u.onend = done;
    u.onerror = done;
    this.queued++;
    window.speechSynthesis.speak(u);
  }
}

/* ------------------------------------------------------------------ */
/* Speech recognition (Web Speech API)                                 */
/* ------------------------------------------------------------------ */

interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function recognitionSupported() {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function createRecognition(handlers: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError: (e: string) => void; onSpeechStart?: () => void }): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = navigator.language || "en-IN";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!;
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };
  rec.onspeechstart = () => handlers.onSpeechStart?.();
  rec.onerror = (e) => handlers.onError(e.error === "not-allowed" ? "Microphone permission denied." : e.error === "no-speech" ? "" : `Speech recognition: ${e.error}`);
  rec.onend = () => {
    const t = finalText.trim();
    finalText = "";
    if (t) handlers.onFinal(t);
    handlers.onEnd();
  };
  return rec;
}
