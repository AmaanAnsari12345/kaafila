"use client";

import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { useFeature } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { VoiceMode } from "./voice-mode";

/** Floating "talk to KAAFILA" orb, available on every page. Keyboard: Alt+V. */
export function VoiceLauncher({ className }: { className?: string }) {
  const enabled = useFeature("voice_mode");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "v") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("voice-launcher fixed z-40 flex h-14 w-14 items-center justify-center rounded-full text-white", className ?? "bottom-24 right-4 lg:bottom-6 lg:right-6")}
        aria-label="Talk to KAAFILA (Alt+V)"
        title="Talk to KAAFILA (Alt+V)"
      >
        <AudioLines className="relative h-6 w-6" />
      </button>
      <VoiceMode open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Inline "Talk to KAAFILA" call-to-action (landing page, empty states). */
export function VoiceCta({ className, label = "Talk to KAAFILA" }: { className?: string; label?: string }) {
  const enabled = useFeature("voice_mode");
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-5 py-3 font-medium text-cyan-50 transition hover:bg-cyan-300/20 hover:shadow-glow", className)}
      >
        <AudioLines className="h-4 w-4 text-cyan-300 transition group-hover:scale-110" />
        {label}
      </button>
      <VoiceMode open={open} onClose={() => setOpen(false)} />
    </>
  );
}
