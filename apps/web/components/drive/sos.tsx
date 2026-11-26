"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HeartPulse, LifeBuoy, ShieldAlert, Siren, Wrench } from "lucide-react";
import type { SosEvent } from "@kaafila/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Kind = SosEvent["kind"];

const KINDS: { kind: Kind; label: string; icon: typeof Siren; description: string }[] = [
  { kind: "manual", label: "Emergency", icon: Siren, description: "Something is wrong and I need help now." },
  { kind: "medical", label: "Medical", icon: HeartPulse, description: "Someone is unwell or injured." },
  { kind: "breakdown", label: "Breakdown", icon: Wrench, description: "The car can't continue." },
  { kind: "security", label: "Security", icon: ShieldAlert, description: "I feel unsafe." }
];

export function SosButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-300 bg-rose-600 text-sm font-bold text-white shadow-danger transition hover:bg-rose-500 active:scale-95"
      aria-label="Raise SOS"
    >
      SOS
    </button>
  );
}

export function SosDialog({ open, onClose, onRaise, emergencyNumber }: { open: boolean; onClose: () => void; onRaise: (kind: Kind) => Promise<void>; emergencyNumber: string }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Raise SOS" description="Your leader, sweeper and every car in the convoy get your location and safety card instantly.">
      <a href={`tel:${emergencyNumber}`} className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-base font-semibold text-white hover:bg-rose-500">
        <LifeBuoy className="h-5 w-5" />
        Call {emergencyNumber} (emergency services)
      </a>
      <div className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(k.kind);
              try {
                await onRaise(k.kind);
                onClose();
              } finally {
                setBusy(null);
              }
            }}
            className="flex items-start gap-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-left transition hover:bg-rose-500/20 disabled:opacity-60"
          >
            <k.icon className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
            <span>
              <span className="block font-semibold">{busy === k.kind ? "Sending…" : k.label}</span>
              <span className="text-xs text-rose-100/80">{k.description}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        KAAFILA SOS alerts your convoy; it does not contact emergency services for you. See <Link href="/roadside" className="underline">Roadside</Link> for guides.
      </p>
    </Modal>
  );
}

/** Shown when the crash heuristic fires: 20 seconds to cancel before the convoy is alerted. */
export function CrashCountdown({ open, peakG, onCancel, onConfirm }: { open: boolean; peakG: number; onCancel: () => void; onConfirm: () => void }) {
  const [left, setLeft] = useState(20);
  const fired = useRef(false);

  useEffect(() => {
    if (!open) return;
    setLeft(20);
    fired.current = false;
    if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400, 200, 400]);
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open && left <= 0 && !fired.current) {
      fired.current = true;
      onConfirm();
    }
  }, [left, open, onConfirm]);

  return (
    <Modal open={open} onClose={onCancel} title="Possible crash detected" description={`A sudden impact (${peakG.toFixed(1)} g) followed by a stop was detected.`}>
      <div className="text-center">
        <p className="text-6xl font-bold tabular-nums text-rose-300" aria-live="assertive">{Math.max(0, left)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Your convoy will be alerted with your location unless you cancel.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button size="default" className="h-14 text-base" onClick={onCancel}>
            I'm OK — cancel
          </Button>
          <Button size="default" variant="destructive" className="h-14 text-base" onClick={onConfirm}>
            Send SOS now
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Crash detection is an aid, not a certified safety system. If anyone is hurt, call emergency services.</p>
      </div>
    </Modal>
  );
}
