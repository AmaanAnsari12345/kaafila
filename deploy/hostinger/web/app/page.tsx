import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  BatteryWarning,
  CalendarDays,
  CarFront,
  Check,
  Coffee,
  HeartPulse,
  LifeBuoy,
  Link2,
  MapPin,
  Plug,
  Radio,
  ShieldCheck,
  SignalZero,
  Sparkles,
  Users,
  Wallet
} from "lucide-react";
import { PLAN_CARDS } from "@kaafila/shared";
import { PricingCalculator } from "@/components/billing/billing-view";

const SIGNATURE = [
  { icon: Activity, title: "Elastic Band", body: "Measures how stretched the convoy is along the actual route and tells the leader exactly how much to ease off before the tail gets lost." },
  { icon: BatteryWarning, title: "Weakest-Link Range", body: "Knows which car runs out of fuel or charge first and picks the last stop on the route that car can still reach." },
  { icon: MapPin, title: "Fair Regroup", body: "Scattered cars? Picks the stop where the last car arrives soonest — not the one that's convenient only for the leader." },
  { icon: SignalZero, title: "Dead-Zone Forecast", body: "Learns where phones lose signal from every convoy's gaps, and warns you to regroup before the ghat section goes dark." },
  { icon: Coffee, title: "Convoy Pulse", body: "Tracks continuous driving per car and nudges a 15-minute break every 2 hours, the guidance many road-safety agencies give." },
  { icon: HeartPulse, title: "Crash-aware SOS", body: "A sudden impact followed by a stop starts a 20-second countdown. Cancel it, or your convoy gets your location and safety card." },
  { icon: Wallet, title: "Kitty", body: "Log fuel, tolls and food as you go. Settle the whole trip in the fewest payments, with one-tap UPI links." },
  { icon: Link2, title: "Family follow", body: "Send home a live, read-only link that expires on its own. No app or account for them." }
];

const STEPS = [
  { title: "Plan", body: "Create a convoy, pick the route, and share the invite link or QR." },
  { title: "Board", body: "Everyone picks their car. Pair a dash tablet as co-pilot. Tick the pre-trip checklist." },
  { title: "Drive", body: "Live formation, quick signals read aloud, voice, and intel that updates every few seconds." },
  { title: "Arrive", body: "Journey report, settle the kitty, post the trip to your club." }
];

const COMPARE = [
  ["Turn-by-turn maps and traffic", "Excellent", "Uses open maps; for turn-by-turn, keep your favourite nav app open"],
  ["Who's ahead, who's behind, by how much", "Location dots", "Route-projected formation, gaps and stretch"],
  ["Keeping the group together", "—", "Elastic Band pacing + fair regroup points"],
  ["Fuel planning for the whole group", "—", "Weakest-link range across every car"],
  ["Losing signal in the hills", "—", "Dead-zone forecast learned from past convoys"],
  ["Emergency in the group", "Phone-level features vary by device", "Convoy-wide SOS with safety card + crash countdown"],
  ["Splitting trip costs", "—", "Kitty with minimum-transfer settlement and UPI"]
];

const FAQ = [
  { q: "How does ₹500 per car work?", a: "Each car that drives on KAAFILA Drive needs a seat. Buy as many seats as you need and assign them to your cars — or sponsor every car in a convoy you organise. The price includes GST by default." },
  { q: "Can people join for free?", a: "Yes. Explorer is free: any car can join a convoy, share location every 10 seconds, send quick signals, raise an SOS and split expenses." },
  { q: "Does it work on iPhone?", a: "Yes, in Safari — add it to your Home Screen. Two limits apply to all browsers on iPhone: no Bluetooth OBD, and location pauses when the app isn't on screen. Native apps are on the roadmap." },
  { q: "Who can see my location?", a: "Only members of convoys you join, plus anyone you send a family link to, until it expires. Staff see it only when handling an SOS." },
  { q: "Is crash detection reliable?", a: "It's an aid, not a certified safety system. It uses your phone's motion sensors and speed, always lets you cancel, and never replaces calling emergency services." }
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/kaafila-mark.svg" alt="" width={32} height={32} priority />
          <span className="text-lg font-semibold tracking-wide">KAAFILA</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#features" className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            Features
          </a>
          <a href="#pricing" className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:block">
            Pricing
          </a>
          <Link href="/login" className="px-3 py-2 text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href="/drive" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
            Open app
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-medium text-primary">The group-driving operating system</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Drive together. Arrive together.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            KAAFILA keeps every car in your group coordinated — pacing, fuel stops, regroups, emergencies and expenses — from the first invite to the last UPI settlement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/drive" className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
              Try the live demo
            </Link>
            <a href="#pricing" className="rounded-lg border border-white/15 px-5 py-3 font-medium hover:bg-white/5">
              ₹500 per car / month
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">The demo runs the real intelligence engine on simulated cars. No account needed.</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Elastic Band · live</p>
          <p className="mt-2 text-lg font-semibold">Convoy is stretching (1.8 km)</p>
          <p className="text-sm text-muted-foreground">Leader: ease off by about 10 km/h until the tail closes up.</p>
          <div className="mt-5 space-y-3">
            {[
              { name: "Aarav · leader", gap: "lead", w: "100%", c: "bg-amber-400" },
              { name: "Zara", gap: "+500 m", w: "72%", c: "bg-primary" },
              { name: "Kabir · EV 24%", gap: "+700 m", w: "45%", c: "bg-primary" },
              { name: "Maya · sweeper", gap: "+600 m", w: "22%", c: "bg-violet-400" }
            ].map((r) => (
              <div key={r.name}>
                <div className="flex justify-between text-xs">
                  <span>{r.name}</span>
                  <span className="tabular-nums text-muted-foreground">{r.gap}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-white/10">
                  <div className={`h-2 rounded-full ${r.c}`} style={{ width: r.w }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm">Kabir limits the convoy to ~42 km. Plan to charge at the plaza 13 km ahead.</div>
          <p className="mt-2 text-[11px] text-muted-foreground">Illustration of the cockpit's intel panel.</p>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">Built for the group, not just the car</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Navigation apps get one car from A to B. KAAFILA solves what happens between the cars.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNATURE.map((f) => (
            <div key={f.title} className="glass-panel rounded-lg p-4">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">How a KAAFILA trip works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass-panel rounded-lg p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-3">
        {[
          { icon: LifeBuoy, title: "Roadside, offline", body: "Emergency numbers by country, step-by-step guides for flat tyres, overheating, jump-starts, accidents and floods — cached so they work with no signal. Nearby fuel, hospitals, mechanics and toilets." },
          { icon: CarFront, title: "Car care", body: "Service reminders by date and odometer, document expiry alerts for insurance, RC, PUC and FASTag, a pre-trip checklist, and live OBD-II data from a Bluetooth adapter." },
          { icon: Plug, title: "Connected devices", body: "Pair a dash tablet or passenger phone as the car's co-pilot with a 6-digit code, so the driver keeps eyes on the road. Clear guidance on what each phone and browser supports." },
          { icon: Users, title: "Clubs & community", body: "Clubs with their own feeds, profiles with your garage showcase, follows, and road reports confirmed by other drivers." },
          { icon: CalendarDays, title: "Reviewed meetups", body: "Host drive-ins and breakfast runs. Every meetup is reviewed before it's listed; RSVP with your car and check in at the venue." },
          { icon: Sparkles, title: "AI co-pilot", body: "Ask by voice: where to stop, who needs a break, the nearest hospital, what to do with a flat. Answers come from your convoy's live data." }
        ].map((f) => (
          <div key={f.title} className="glass-panel rounded-lg p-5">
            <f.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">Honest comparison</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Big navigation apps have better base maps and traffic. Keep using them for turn-by-turn. KAAFILA adds everything a group needs on top.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Need</th>
                <th className="py-3 pr-4">Typical navigation app</th>
                <th className="py-3">KAAFILA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {COMPARE.map(([need, them, us]) => (
                <tr key={need}>
                  <td className="py-3 pr-4 font-medium">{need}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{them}</td>
                  <td className="py-3">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">Simple pricing: ₹500 per car per month</h2>
        <p className="mt-2 text-muted-foreground">Free to join. Pay only for the cars that want everything.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {PLAN_CARDS.map((p) => (
            <div key={p.code} className={`glass-panel rounded-lg p-5 ${p.code === "drive" ? "border-primary/50 shadow-glow" : ""}`}>
              <p className="text-sm text-muted-foreground">{p.name}</p>
              <p className="mt-1 text-3xl font-semibold">{p.priceLabel}</p>
              <p className="text-sm text-muted-foreground">{p.cadence}</p>
              <p className="mt-3 text-sm">{p.tagline}</p>
              <ul className="mt-4 grid gap-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={p.code === "fleet" ? "/billing" : p.code === "drive" ? "/billing" : "/drive"} className="mt-5 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-medium hover:bg-white/5">
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-6 max-w-xl">
          <PricingCalculator />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="text-2xl font-semibold">Questions</h2>
        <div className="mt-6 grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="glass-panel rounded-lg p-4">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 text-center">
        <div className="glass-panel rounded-2xl p-8">
          <Radio className="mx-auto h-6 w-6 text-primary" />
          <h2 className="mt-3 text-2xl font-semibold">Your next road trip, without the "where are you?" calls.</h2>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/drive" className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
              Try the demo
            </Link>
            <Link href="/login" className="rounded-lg border border-white/15 px-5 py-3 font-medium hover:bg-white/5">
              Create your first convoy
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" /> KAAFILA™ · Map data © OpenStreetMap contributors · Always follow traffic laws; never use your phone by hand while driving.
        </p>
      </footer>
    </main>
  );
}
