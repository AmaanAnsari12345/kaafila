"use client";

import type { ConvoyIntelReport } from "@kaafila/shared";
import { cn } from "@/lib/utils";

/**
 * Heads-up cockpit overlay. Pure SVG + CSS so it renders at 60fps on low-end
 * phones and never blocks the map underneath (pointer-events: none).
 */

const ARC_START = 135; // degrees, clockwise from +x
const ARC_SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, sweep: number) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, fromDeg + sweep);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function GaugeDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#22d3ee" />
        <stop offset="60%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#f472b6" />
      </linearGradient>
    </defs>
  );
}

export function SpeedDial({ kph, max = 160, size = 132 }: { kph: number | null; max?: number; size?: number }) {
  const c = size / 2;
  const r = c - 10;
  const length = (Math.PI * 2 * r * ARC_SWEEP) / 360;
  const pct = kph == null ? 0 : Math.min(1, Math.max(0, kph / max));
  const ticks = Array.from({ length: 9 }, (_, i) => i / 8);
  return (
    <div className="hud-chip relative rounded-full" style={{ width: size, height: size }} aria-label={`Speed ${kph == null ? "unknown" : Math.round(kph)} km/h`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <GaugeDefs id="hud-speed" />
        <path d={arcPath(c, c, r, ARC_START, ARC_SWEEP)} className="hud-gauge-track" strokeWidth={7} fill="none" strokeLinecap="round" />
        <path
          d={arcPath(c, c, r, ARC_START, ARC_SWEEP)}
          stroke="url(#hud-speed)"
          className="hud-gauge-value"
          style={{ stroke: "url(#hud-speed)" }}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - pct)}
        />
        {ticks.map((t, i) => {
          const deg = ARC_START + ARC_SWEEP * t;
          const a = polar(c, c, r - 9, deg);
          const b = polar(c, c, r - (i % 2 === 0 ? 17 : 13), deg);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(203,213,225,0.45)" strokeWidth={i % 2 === 0 ? 1.6 : 1} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold leading-none tabular-nums text-white">{kph == null ? "—" : Math.round(kph)}</span>
        <span className="hud-label mt-1">km/h</span>
      </div>
    </div>
  );
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function Compass({ headingDeg, size = 84 }: { headingDeg: number | null; size?: number }) {
  const c = size / 2;
  const r = c - 6;
  const h = headingDeg ?? 0;
  const label = headingDeg == null ? "—" : CARDINALS[Math.round(h / 45) % 8];
  return (
    <div className="hud-chip relative rounded-full" style={{ width: size, height: size }} aria-label={`Heading ${label}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={1.5} />
        <g style={{ transform: `rotate(${-h}deg)`, transformOrigin: "50% 50%", transition: "transform 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}>
          {Array.from({ length: 24 }, (_, i) => {
            const deg = i * 15 - 90;
            const a = polar(c, c, r, deg);
            const b = polar(c, c, r - (i % 6 === 0 ? 7 : 3), deg);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={i === 0 ? "#f472b6" : "rgba(203,213,225,0.5)"} strokeWidth={i % 6 === 0 ? 1.8 : 1} />;
          })}
          {["N", "E", "S", "W"].map((l, i) => {
            const p = polar(c, c, r - 14, i * 90 - 90);
            return (
              <text key={l} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={9} fill={l === "N" ? "#f472b6" : "rgba(226,232,240,0.75)"} fontFamily="var(--font-mono)">
                {l}
              </text>
            );
          })}
        </g>
        <path d={`M ${c} ${6} l -4 7 h 8 z`} fill="#22d3ee" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-semibold text-white">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{headingDeg == null ? "" : `${Math.round(h)}°`}</span>
      </div>
    </div>
  );
}

const LEVEL_COLOR: Record<string, string> = { tight: "#22d3ee", stretching: "#fbbf24", broken: "#f87171" };

export function StretchMeter({ intel, softMeters = 800, hardMeters = 2500 }: { intel: ConvoyIntelReport | null; softMeters?: number; hardMeters?: number }) {
  const stretch = intel?.elastic.stretchMeters ?? 0;
  const level = intel?.elastic.level ?? "tight";
  const max = hardMeters * 1.25;
  const pct = Math.min(1, stretch / max);
  const color = LEVEL_COLOR[level] ?? "#22d3ee";
  const cars = intel?.formation.entries.length ?? 0;
  return (
    <div className="hud-chip w-56 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="hud-label">Convoy stretch</span>
        <span className="font-mono text-xs" style={{ color }}>
          {level}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-xl font-semibold tabular-nums text-white">{stretch >= 1000 ? (stretch / 1000).toFixed(1) : Math.round(stretch)}</span>
        <span className="text-xs text-muted-foreground">{stretch >= 1000 ? "km" : "m"} across {cars} cars</span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, #22d3ee, ${color})`, boxShadow: `0 0 12px ${color}` }} />
        <span className="absolute inset-y-0 w-px bg-amber-300/70" style={{ left: `${(softMeters / max) * 100}%` }} />
        <span className="absolute inset-y-0 w-px bg-red-400/80" style={{ left: `${(hardMeters / max) * 100}%` }} />
      </div>
      {intel && intel.elastic.leaderSpeedDeltaKph > 0 ? <p className="mt-1.5 text-[11px] text-amber-200">Lead: ease off {Math.round(intel.elastic.leaderSpeedDeltaKph)} km/h</p> : null}
    </div>
  );
}

export function HealthRing({ score, size = 84 }: { score: number | null; size?: number }) {
  const c = size / 2;
  const r = c - 8;
  const circ = 2 * Math.PI * r;
  const s = score ?? 0;
  const color = s >= 80 ? "#34d399" : s >= 55 ? "#fbbf24" : "#f87171";
  return (
    <div className="hud-chip relative rounded-full" style={{ width: size, height: size }} aria-label={`Convoy health ${score ?? "unknown"}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={c} cy={c} r={r} className="hud-gauge-track" strokeWidth={6} fill="none" />
        <circle
          cx={c}
          cy={c}
          r={r}
          stroke={color}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - s / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset 0.7s cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-semibold tabular-nums text-white">{score ?? "—"}</span>
        <span className="hud-label">health</span>
      </div>
    </div>
  );
}

export function CockpitHud({
  kph,
  headingDeg,
  intel,
  softMeters,
  hardMeters,
  className
}: {
  kph: number | null;
  headingDeg: number | null;
  intel: ConvoyIntelReport | null;
  softMeters?: number;
  hardMeters?: number;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none flex flex-col gap-2", className)}>
      <div className="flex items-end gap-2">
        <SpeedDial kph={kph} />
        <div className="hidden flex-col gap-2 sm:flex">
          <Compass headingDeg={headingDeg} />
          {intel ? <HealthRing score={intel.healthScore} /> : null}
        </div>
      </div>
      {intel ? (
        <div className="hidden sm:block">
          <StretchMeter intel={intel} softMeters={softMeters} hardMeters={hardMeters} />
        </div>
      ) : null}
    </div>
  );
}
