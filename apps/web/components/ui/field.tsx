import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black/25 px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, "h-auto min-h-24 py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(inputClass, "appearance-none pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("glass-panel rounded-lg p-4", className)} {...props}>
      {children}
    </section>
  );
}

export function CardTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs uppercase tracking-wide text-muted-foreground">{eyebrow}</p> : null}
        <h2 className="mt-0.5 text-base font-semibold">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "danger" | "ok"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-sky-400/25 bg-sky-400/10 text-sky-100",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    danger: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    ok: "border-primary/30 bg-primary/10 text-teal-50"
  };
  return <div className={cn("rounded-lg border p-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-white/[0.04] p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition", value === it.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {it.label}
          {it.badge ? <span className="rounded bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{it.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
