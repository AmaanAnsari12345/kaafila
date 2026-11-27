"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CarFront, Compass, CreditCard, LifeBuoy, LogIn, LogOut, Menu, Plug, Shield, Sparkles, Users, CalendarDays, Video, X } from "lucide-react";
import { VoiceLauncher } from "@/components/voice/voice-launcher";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/drive", label: "Drive", icon: Compass },
  { href: "/garage", label: "Garage", icon: CarFront },
  { href: "/community", label: "Community", icon: Users },
  { href: "/meetups", label: "Meetups", icon: CalendarDays },
  { href: "/roadside", label: "Roadside", icon: LifeBuoy },
  { href: "/copilot", label: "Co-pilot", icon: Sparkles },
  { href: "/calls", label: "Calls", icon: Video },
  { href: "/connect", label: "Connect", icon: Plug },
  { href: "/billing", label: "Billing", icon: CreditCard }
] as const;

const MOBILE = ["/drive", "/garage", "/roadside", "/copilot", "/community"];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, status, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const isStaff = me?.role === "admin" || me?.role === "support";

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-cyan-300/10 bg-[#03050a]/75 backdrop-blur-xl after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-cyan-400/50 after:to-transparent">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <button type="button" className="rounded-lg p-2 hover:bg-white/10 xl:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/kaafila-mark.svg" alt="" width={28} height={28} priority />
            <span className="font-display text-sm font-semibold tracking-[0.3em] neon-text">KAAFILA</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 xl:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground",
                  pathname.startsWith(item.href) && "bg-cyan-300/10 text-cyan-50 shadow-[inset_0_-2px_0_rgb(34,211,238)]"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {isStaff ? (
              <Link href="/admin" className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5", pathname.startsWith("/admin") && "bg-white/[0.07] text-foreground")}>
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {status === "signed_in" && me ? (
              <>
                <Badge variant={me.plan === "explorer" ? "neutral" : "default"} className="hidden sm:inline-flex">
                  {me.plan === "explorer" ? "Explorer" : me.plan === "drive" ? "Drive" : "Fleet"}
                </Badge>
                <Link href="/profile" className="hidden max-w-40 truncate text-sm text-muted-foreground hover:text-foreground sm:block">
                  {me.displayName}
                </Link>
                <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-muted-foreground hover:bg-white/10" aria-label="Sign out" title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : status === "signed_out" ? (
              <Link href="/login" className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm xl:hidden" onClick={() => setOpen(false)}>
          <nav className="h-full w-72 border-r border-white/10 bg-[#0b0f16] p-4" onClick={(e) => e.stopPropagation()} aria-label="Main">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">Menu</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-1">
              {[...NAV, ...(isStaff ? [{ href: "/admin", label: "Admin", icon: Shield } as const] : []), { href: "/profile", label: "Profile & safety card", icon: Users } as const].map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm", pathname.startsWith(item.href) ? "bg-white/[0.08]" : "hover:bg-white/5")}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-cyan-300/10 bg-[#03050a]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
        {NAV.filter((n) => MOBILE.includes(n.href)).map((item) => (
          <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 py-2 text-[11px]", pathname.startsWith(item.href) ? "text-primary" : "text-muted-foreground")}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
      <VoiceLauncher />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="hud-label">{eyebrow}</p> : null}
        <h1 className="font-display mt-1 text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SignInPrompt({ what }: { what: string }) {
  return (
    <div className="glass-panel rounded-lg p-6 text-center">
      <p className="text-lg font-semibold">Sign in to {what}</p>
      <p className="mt-1 text-sm text-muted-foreground">Your data stays private to you and the convoys you join.</p>
      <Link href="/login" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        <LogIn className="h-4 w-4" />
        Sign in
      </Link>
    </div>
  );
}
