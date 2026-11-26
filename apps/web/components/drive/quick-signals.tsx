"use client";

import { QUICK_SIGNALS, type QuickSignalCode } from "@kaafila/shared";
import { cn } from "@/lib/utils";

const PRIMARY: QuickSignalCode[] = ["need_fuel", "washroom", "slow_down", "pull_over", "all_ok", "flat_tyre", "hazard_ahead", "lost", "wait_for_me", "need_charge", "food_break", "police_ahead"];

export function QuickSignals({ onSend, disabled }: { onSend: (code: QuickSignalCode) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" role="group" aria-label="Quick signals">
      {PRIMARY.map((code) => {
        const s = QUICK_SIGNALS.find((q) => q.code === code)!;
        return (
          <button
            key={code}
            type="button"
            disabled={disabled}
            onClick={() => onSend(code)}
            className={cn(
              "min-h-14 rounded-lg border px-2 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50",
              s.severity === "critical"
                ? "border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                : s.severity === "warning"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-50 hover:bg-amber-400/20"
                  : "border-white/10 bg-white/[0.05] hover:bg-white/10"
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
