import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  AudioLines,
  BatteryWarning,
  CalendarDays,
  CarFront,
  Check,
  Coffee,
  Fuel,
  Gauge,
  HeartPulse,
  LifeBuoy,
  Link2,
  MapPin,
  Mountain,
  Plug,
  Radio,
  ShieldCheck,
  SignalZero,
  Sparkles,
  Tent,
  Users,
  Video,
  Wallet,
  Wrench
} from "lucide-react";
import { FEATURE_REGISTRY, PLAN_CARDS, type FeatureStage } from "@kaafila/shared";
import { PricingCalculator } from "@/components/billing/billing-view";
import { HeroConvoy } from "@/components/landing/hero-convoy";
import { VoiceCta, VoiceLauncher } from "@/components/voice/voice-launcher";

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

const ENTHUSIAST = [
  { icon: Fuel, title: "Fuel log & real mileage", body: "Log fill-ups and get real-world km/l or km/kWh from full tank to full tank, plus cost per km — not the brochure figure." },
  { icon: Wrench, title: "Build sheet", body: "Every mod and part — intake, wheels, suspension, lighting — on your public garage showcase for the community to see." },
  { icon: Gauge, title: "Smooth-driving score", body: "A score from harsh braking and acceleration on your real drives, so you can drive smoother, safer and kinder to the car." },
  { icon: Mountain, title: "Scenic routes", body: "Share the roads you loved straight from a finished convoy, rate others' routes, and start a convoy on one in a tap." }
];

const STEPS = [
  { title: "Plan", body: "Create a convoy, pick the route, and share the invite link or QR." },
  { title: "Board", body: "Everyone picks their car. Pair a dash tablet as co-pilot. Tick the pre-trip checklist." },
  { title: "Drive", body: "Live formation, quick signals read aloud, push-to-talk, and intel that updates every few seconds." },
  { title: "Arrive", body: "Journey report, settle the kitty, share the route and post the trip to your club." }
];

const COMPARE = [
  ["Turn-by-turn maps and traffic", "Excellent", "Uses open maps; for turn-by-turn, keep your favourite nav app open"],
  ["Who's ahead, who's behind, by how much", "Location dots", "Route-projected formation, gaps and stretch"],
  ["Keeping the group together", "—", "Elastic Band pacing + fair regroup points"],
  ["Fuel planning for the whole group", "—", "Weakest-link range across every car"],
  ["Losing signal in the hills", "—", "Dead-zone forecast learned from past convoys"],
  ["Talking to the group while driving", "—", "Push-to-talk channels; drivers are audio-only"],
  ["Emergency in the group", "Phone-level features vary by device", "Convoy-wide SOS with safety card + crash countdown"],
  ["Splitting trip costs", "—", "Kitty with minimum-transfer settlement and UPI"]
];

const FAQ = [
  { q: "How does ₹500 per car work?", a: "Each car that drives on KAAFILA Drive needs a seat. Buy as many seats as you need and assign them to your cars — or sponsor every car in a convoy you organise. The price includes GST by default." },
  { q: "Can people join for free?", a: "Yes. Explorer is free: any car can join a convoy, share location every 10 seconds, send quick signals, raise an SOS and split expenses." },
  { q: "What can I ask the voice co-pilot?", a: "Anything about the app and its features, roadside problems like a flat tyre or overheating, and — inside a convoy — live questions like who needs a break or where to regroup. It streams its answer sentence by sentence so it starts speaking quickly, and shows you the measured delay. In an emergency it always tells you to call the local emergency number first." },
  { q: "Is it safe to be on a call while driving?", a: "Drivers join convoy channels audio-only with push-to-talk, so nothing needs looking at. Video is only available in club lounges, for when you're parked. Always follow your local law on phone use." },
  { q: "Does it work on iPhone?", a: "Yes, in Safari — add it to your Home Screen. Two limits apply to all browsers on iPhone: no Bluetooth OBD, and location pauses when the app isn't on screen. Native apps are on the roadmap." },
  { q: "Who can see my location?", a: "Only members of convoys you join, plus anyone you send a family link to, until it expires. Staff see it only when handling an SOS." },
  { q: "Is crash detection reliable?", a: "It's an aid, not a certified safety system. It uses your phone's motion sensors and speed, always lets you cancel, and never replaces calling emergency services." }
];

const STAGE_META: Record<FeatureStage, { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" },
  beta: { label: "Beta", className: "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" },
  planned: { label: "Coming", className: "border-violet-300/40 bg-violet-300/10 text-violet-100" }
};

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="hud-label">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl font-semibold sm:text-4xl">{title}</h2>
      {body ? <p className="mt-3 text-muted-foreground">{body}</p> : null}
    </div>
  );
}

export default function Home() {
  const roadmap = (["live", "beta", "planned"] as FeatureStage[]).map((stage) => ({ stage, items: FEATURE_REGISTRY.filter((f) => f.stage === stage) }));

  return (
    <main className="relative overflow-x-hidden">
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[720px] opacity-70" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#03050a]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/kaafila-mark.svg" alt="" width={32} height={32} priority />
            <span className="font-display bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-lg font-semibold tracking-[0.2em] text-transparent">KAAFILA</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {[
              ["#features", "Features"],
              ["#voice", "Voice & calls"],
              ["#roadmap", "Roadmap"],
              ["#pricing", "Pricing"]
            ].map(([href, label]) => (
              <a key={href} href={href} className="hidden px-3 py-2 text-muted-foreground transition hover:text-foreground md:block">
                {label}
              </a>
            ))}
            <Link href="/login" className="px-3 py-2 text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link href="/drive" className="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 font-medium text-slate-950 shadow-glow">
              Open app
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-100">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> Group-driving OS
          </p>
          <h1 className="font-display mt-5 text-5xl font-semibold leading-[1.05] sm:text-6xl">
            Drive together.
            <br />
            <span className="neon-text bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 bg-clip-text text-transparent">Arrive together.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            KAAFILA keeps every car in your group coordinated — pacing, fuel stops, regroups, push-to-talk, emergencies and expenses — from the first invite to the last UPI settlement.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/drive" className="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 font-semibold text-slate-950 shadow-glow transition hover:brightness-110">
              Launch the live demo
            </Link>
            <VoiceCta />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">The demo runs the real intelligence engine on simulated cars. No account needed. Voice works in Chrome, Edge and Safari.</p>
          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              ["₹500", "per car / month"],
              ["8", "convoy intelligences"],
              ["Free", "to join a convoy"]
            ].map(([v, l]) => (
              <div key={l} className="hud-chip px-3 py-2.5">
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-2xl font-semibold text-white">{v}</dd>
                <dd className="text-[11px] text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        <HeroConvoy />
      </section>

      {/* Signature intelligence */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <SectionHead eyebrow="Convoy intelligence" title="Built for the group, not just the car" body="Navigation apps get one car from A to B. KAAFILA solves what happens between the cars." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNATURE.map((f) => (
            <div key={f.title} className="glass-panel group rounded-xl p-5 transition hover:-translate-y-0.5 hover:shadow-glow">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
                <f.icon className="h-5 w-5 text-cyan-300" />
              </span>
              <h3 className="font-display mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Voice + calls */}
      <section id="voice" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel hud-corners relative overflow-hidden rounded-2xl p-7">
            <div className="voice-orb pointer-events-none absolute -right-10 -top-10 h-48 w-48 opacity-50" aria-hidden>
              <div className="voice-orb__ring" />
              <div className="voice-orb__core" />
            </div>
            <AudioLines className="relative h-6 w-6 text-cyan-300" />
            <h3 className="font-display relative mt-4 text-2xl font-semibold">Just ask, out loud</h3>
            <p className="relative mt-2 max-w-md text-muted-foreground">
              Voice mode is a hands-free conversation with the KAAFILA co-pilot. Ask how a feature works, what to do when the engine overheats, or — mid-convoy — who needs a break and where to regroup. Answers stream sentence by sentence, so it starts talking before it finishes thinking, and you can interrupt any time.
            </p>
            <ul className="relative mt-4 grid gap-1.5 text-sm">
              {["Live convoy context: formation, range, fatigue, SOS", "Roadside guides and emergency numbers built in", "Shows the measured time to first word"].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  {t}
                </li>
              ))}
            </ul>
            <VoiceCta className="relative mt-6" label="Try voice mode" />
          </div>
          <div className="glass-panel relative overflow-hidden rounded-2xl p-7">
            <Video className="h-6 w-6 text-violet-300" />
            <h3 className="font-display mt-4 text-2xl font-semibold">Group calls, built for the road</h3>
            <p className="mt-2 max-w-md text-muted-foreground">Every convoy gets voice channels — main, leaders-only and emergency. Drivers hold to talk, audio-only, so their eyes stay on the road. Clubs get video lounges with screen share for planning the next run.</p>
            <div className="mt-6 grid gap-2">
              {[
                { name: "Main channel", who: "6 cars · push-to-talk", live: true },
                { name: "Leaders", who: "lead + sweeper", live: false },
                { name: "Emergency", who: "opens on SOS", live: false }
              ].map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Radio className={c.live ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-muted-foreground"} />
                    {c.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{c.who}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Enthusiasts */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHead eyebrow="For car people" title="Your garage, your builds, your roads" body="The things every enthusiast tracks in notebooks and group chats — in one place, tied to the car." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENTHUSIAST.map((f) => (
            <div key={f.title} className="glass-panel rounded-xl p-5">
              <f.icon className="h-5 w-5 text-fuchsia-300" />
              <h3 className="font-display mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHead eyebrow="Trip flow" title="How a KAAFILA trip works" />
        <ol className="relative mt-8 grid gap-4 md:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-cyan-400/0 via-cyan-400/60 to-violet-400/0 md:block" aria-hidden />
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass-panel relative rounded-xl p-5">
              <span className="font-mono flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/40 bg-[#03050a] text-sm text-cyan-200 shadow-glow">0{i + 1}</span>
              <h3 className="font-display mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-3">
        {[
          { icon: LifeBuoy, title: "Roadside, offline", body: "Emergency numbers by country, step-by-step guides for flat tyres, overheating, jump-starts, accidents and floods — cached so they work with no signal. Nearby fuel, hospitals, mechanics and toilets." },
          { icon: CarFront, title: "Car care", body: "Service reminders by date and odometer, document expiry alerts for insurance, RC, PUC and FASTag, a pre-trip checklist, and live OBD-II data from a Bluetooth adapter." },
          { icon: Plug, title: "Connected devices", body: "Pair a dash tablet or passenger phone as the car's co-pilot with a 6-digit code, so the driver keeps eyes on the road. Clear guidance on what each phone and browser supports." },
          { icon: Users, title: "Clubs & community", body: "Clubs with their own feeds, profiles with your garage showcase and build sheet, follows, and road reports confirmed by other drivers." },
          { icon: CalendarDays, title: "Reviewed meetups", body: "Host drive-ins and breakfast runs. Every meetup is reviewed before it's listed; RSVP with your car and check in at the venue." },
          { icon: Sparkles, title: "Background alerts", body: "SOS, critical signals and meetup waitlist spots reach you as push notifications even when KAAFILA isn't open." }
        ].map((f) => (
          <div key={f.title} className="glass-panel rounded-xl p-5">
            <f.icon className="h-5 w-5 text-cyan-300" />
            <h3 className="font-display mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHead eyebrow="No hype" title="Honest comparison" body="Big navigation apps have better base maps and traffic. Keep using them for turn-by-turn. KAAFILA adds everything a group needs on top." />
        <div className="glass-panel mt-8 overflow-x-auto rounded-xl">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="hud-label">
              <tr>
                <th className="px-4 py-3">Need</th>
                <th className="px-4 py-3">Typical navigation app</th>
                <th className="px-4 py-3 text-cyan-200">KAAFILA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {COMPARE.map(([need, them, us]) => (
                <tr key={need}>
                  <td className="px-4 py-3 font-medium">{need}</td>
                  <td className="px-4 py-3 text-muted-foreground">{them}</td>
                  <td className="px-4 py-3">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <SectionHead eyebrow="Staged rollout" title="What's live, what's in beta, what's next" body="Features roll out gradually so every release is solid. This list comes from the same registry the app uses to switch features on." />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {roadmap.map(({ stage, items }) => (
            <div key={stage} className="glass-panel rounded-xl p-5">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-widest ${STAGE_META[stage].className}`}>{STAGE_META[stage].label}</span>
              <ul className="mt-4 grid gap-3">
                {items.map((f) => (
                  <li key={f.key}>
                    <p className="flex items-baseline justify-between gap-2 font-medium">
                      {f.name}
                      {f.target ? <span className="shrink-0 font-mono text-[11px] text-violet-200">{f.target}</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="glass-panel hud-corners mt-4 grid items-center gap-6 rounded-2xl p-7 md:grid-cols-[auto_1fr]">
          <div className="flex gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10">
              <Tent className="h-7 w-7 text-emerald-300" />
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10">
              <Users className="h-7 w-7 text-amber-300" />
            </span>
          </div>
          <div>
            <p className="hud-label">Beyond the car</p>
            <h3 className="font-display mt-1 text-2xl font-semibold">The same engine, for any group on the move</h3>
            <p className="mt-2 text-muted-foreground">
              Staying together, pacing to the slowest member, regrouping fairly and getting help fast isn&rsquo;t only a car problem. KAAFILA Trek will bring it to trekking groups on foot, and KAAFILA Tour to guided tourist groups. Both are planned, not live yet.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <SectionHead eyebrow="Pricing" title="Simple: ₹500 per car per month" body="Free to join. Pay only for the cars that want everything." />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PLAN_CARDS.map((p) => (
            <div key={p.code} className={`glass-panel relative rounded-xl p-6 ${p.code === "drive" ? "neon-glow" : ""}`}>
              {p.code === "drive" ? <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-3 py-0.5 text-[11px] font-semibold text-slate-950">Most popular</span> : null}
              <p className="hud-label">{p.name}</p>
              <p className="font-display mt-2 text-4xl font-semibold">{p.priceLabel}</p>
              <p className="text-sm text-muted-foreground">{p.cadence}</p>
              <p className="mt-3 text-sm">{p.tagline}</p>
              <ul className="mt-4 grid gap-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={p.code === "explorer" ? "/drive" : "/billing"} className="mt-6 inline-block rounded-lg border border-cyan-300/30 px-4 py-2 text-sm font-medium hover:bg-cyan-300/10">
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-6 max-w-xl">
          <PricingCalculator />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <SectionHead eyebrow="FAQ" title="Questions" />
        <div className="mt-8 grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="glass-panel group rounded-xl p-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="mr-2 font-mono text-cyan-300 transition group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-6 text-center">
        <div className="glass-panel hud-corners relative overflow-hidden rounded-2xl p-10">
          <div className="aurora pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <Radio className="relative mx-auto h-6 w-6 text-cyan-300" />
          <h2 className="font-display relative mt-3 text-3xl font-semibold">Your next road trip, without the &ldquo;where are you?&rdquo; calls.</h2>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/drive" className="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 font-semibold text-slate-950 shadow-glow">
              Try the demo
            </Link>
            <Link href="/login" className="rounded-lg border border-white/15 px-5 py-3 font-medium hover:bg-white/5">
              Create your first convoy
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-2 px-4">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> KAAFILA™ · Map data © OpenStreetMap contributors · Always follow traffic laws; never use your phone by hand while driving.
        </p>
      </footer>

      <VoiceLauncher className="bottom-6 right-6" />
    </main>
  );
}
