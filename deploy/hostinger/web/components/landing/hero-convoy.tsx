"use client";

import { useEffect, useRef } from "react";
import { HealthRing, SpeedDial } from "@/components/drive/hud";

const ROAD = "M 30 390 C 130 360, 110 280, 220 255 S 390 215, 360 150 S 470 70, 575 40";

const CARS = [
  { id: "lead", color: "#fbbf24", label: "Aarav · lead", begin: "-9s" },
  { id: "c2", color: "#22d3ee", label: "Zara", begin: "-7.4s" },
  { id: "c3", color: "#22d3ee", label: "Kabir · EV", begin: "-6.2s" },
  { id: "sweep", color: "#a78bfa", label: "Maya · sweeper", begin: "-4.6s" }
];

/**
 * Animated illustration of a convoy on a winding road, with the cockpit HUD on top.
 * SMIL animations are paused for people who prefer reduced motion.
 */
export function HeroConvoy() {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) svg.current?.pauseAnimations();
  }, []);

  return (
    <div className="glass-panel hud-corners relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgba(129,140,248,0.18),transparent),radial-gradient(50%_40%_at_20%_90%,rgba(34,211,238,0.16),transparent)]" />
      <svg ref={svg} viewBox="0 0 600 420" className="relative block h-auto w-full" role="img" aria-label="Four cars driving as a convoy on a winding mountain road">
        <defs>
          <linearGradient id="road-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <radialGradient id="car-glow">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <pattern id="hero-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="420" fill="url(#hero-grid)" />

        {/* contour lines: hills */}
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={i} cx="470" cy="300" rx={60 + i * 34} ry={34 + i * 20} fill="none" stroke="rgba(129,140,248,0.12)" strokeWidth="1" />
        ))}

        {/* dead zone learned from past convoys */}
        <path d="M 300 230 C 340 214, 372 196, 368 160" fill="none" stroke="rgba(248,113,113,0.35)" strokeWidth="26" strokeLinecap="round" />
        <text x="384" y="214" fill="rgba(254,202,202,0.9)" fontSize="11" fontFamily="var(--font-mono)">
          DEAD ZONE · 2.1 km
        </text>

        {/* road */}
        <path d={ROAD} fill="none" stroke="rgba(15,23,42,0.9)" strokeWidth="18" strokeLinecap="round" />
        <path d={ROAD} fill="none" stroke="url(#road-grad)" strokeWidth="3" strokeLinecap="round" className="road-glow" />
        <path d={ROAD} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeDasharray="6 10" className="road-dash" />

        {/* fair regroup pin */}
        <g transform="translate(470 92)">
          <circle r="16" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.6)" />
          <circle r="4" fill="#34d399" />
          <text x="22" y="-8" fill="#a7f3d0" fontSize="11" fontFamily="var(--font-mono)">
            FAIR REGROUP
          </text>
          <text x="22" y="7" fill="rgba(226,232,240,0.7)" fontSize="10" fontFamily="var(--font-mono)">
            last car in 6 min
          </text>
        </g>

        {/* cars */}
        {CARS.map((car) => (
          <g key={car.id}>
            <circle r="16" fill="url(#car-glow)" opacity="0.35">
              <animateMotion dur="14s" repeatCount="indefinite" begin={car.begin} path={ROAD} />
            </circle>
            <circle r="6" fill={car.color} stroke="#03050a" strokeWidth="2" style={{ filter: `drop-shadow(0 0 6px ${car.color})` }}>
              <animateMotion dur="14s" repeatCount="indefinite" begin={car.begin} path={ROAD} />
            </circle>
          </g>
        ))}

        {/* legend */}
        <g transform="translate(24 28)" fontFamily="var(--font-mono)" fontSize="10">
          {CARS.map((car, i) => (
            <g key={car.id} transform={`translate(0 ${i * 16})`}>
              <circle r="4" cx="4" cy="-3" fill={car.color} />
              <text x="14" y="0" fill="rgba(226,232,240,0.8)">
                {car.label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* HUD overlay */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-2">
        <SpeedDial kph={72} size={104} />
        <HealthRing score={86} size={72} />
      </div>
      <div className="hud-chip pointer-events-none absolute bottom-3 right-3 max-w-[15rem] px-3 py-2.5 text-xs">
        <p className="hud-label">Co-pilot</p>
        <p className="mt-1 text-slate-100">&ldquo;Kabir&rsquo;s EV limits the group to about 42 km. Charge at the plaza 13 km ahead.&rdquo;</p>
      </div>
      <p className="sr-only">Illustration. The cockpit shows each car&rsquo;s position along the route, the convoy&rsquo;s health, dead zones and a regroup point.</p>
    </div>
  );
}
