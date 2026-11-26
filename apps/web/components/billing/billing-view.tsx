"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CarFront, CreditCard, ShieldCheck, Trash2 } from "lucide-react";
import { PLAN_CARDS, type PriceQuote } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { formatDateTime, inr } from "@/lib/utils";
import { PageHeader } from "@/components/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Empty, Field, Input, Notice, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";

type Quote = PriceQuote & { providers: { razorpay: boolean; stripe: boolean; sandbox: boolean } };

interface Billing {
  taxMode: "inclusive" | "exclusive";
  unitPriceMinor: number;
  subscriptions: {
    id: string;
    status: string;
    provider: string;
    quantity: number;
    amountMinor: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    seats: { id: string; vehicleId: string; vehicle: { id: string; name: string; userId: string; user: { displayName: string } } }[];
    payments: { id: string; amountMinor: number; currency: string; status: string; createdAt: string }[];
  }[];
  vehicles: { id: string; name: string; seat: { id: string; subscriptionId: string } | null }[];
}

export function PricingCalculator({ compact = false }: { compact?: boolean }) {
  const [vehicles, setVehicles] = useState(4);
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      api
        .get<Quote>(`/billing/quote?vehicles=${vehicles}`, { auth: false })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 200);
    return () => window.clearTimeout(t);
  }, [vehicles]);

  // Local fallback so the calculator works even when the API is unreachable.
  const local = { total: vehicles * 50_000 };
  return (
    <Card>
      <CardTitle eyebrow="Calculator" title="KAAFILA Drive for your group" />
      <label className="grid gap-2 text-sm">
        <span className="flex justify-between">
          <span className="text-muted-foreground">Cars</span>
          <span className="font-semibold tabular-nums">{vehicles}</span>
        </span>
        <input type="range" min={1} max={60} value={vehicles} onChange={(e) => setVehicles(Number(e.target.value))} className="accent-teal-400" aria-label="Number of cars" />
      </label>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{inr(quote?.totalMinor ?? local.total)}</p>
          <p className="text-sm text-muted-foreground">per month · ₹500 per car</p>
        </div>
        {quote && !compact ? (
          <div className="text-right text-xs text-muted-foreground">
            <p>Before tax {inr(quote.subtotalMinor)}</p>
            <p>
              GST {Math.round(quote.gstRate * 100)}% {inr(quote.gstMinor)} ({quote.taxMode === "inclusive" ? "included" : "added"})
            </p>
          </div>
        ) : null}
      </div>
      {quote?.exceedsEmandateLimit ? (
        <Notice tone="warn" className="mt-3">
          Over ₹15,000 a month: Indian banks ask you to approve each renewal (RBI e-mandate rule). Split into subscriptions of up to {quote.maxVehiclesPerMandate} cars to keep renewals automatic.
        </Notice>
      ) : null}
    </Card>
  );
}

export function BillingView() {
  const { status, me, refreshMe } = useAuth();
  const params = useSearchParams();
  const { notify, view } = useToast();
  const billing = useLoad<Billing>(status === "signed_in" ? () => api.get("/billing/me") : null, [status]);
  const [count, setCount] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const [provider, setProvider] = useState<"razorpay" | "stripe">("razorpay");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; warnings: string[] } | null>(null);

  const uncovered = (billing.data?.vehicles ?? []).filter((v) => !v.seat);

  useEffect(() => {
    setChosen(uncovered.map((v) => v.id).slice(0, Math.max(1, count)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.data]);

  const checkout = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ provider: string; subscriptionId: string; shortUrl?: string; url?: string | null; warnings: string[] }>("/billing/checkout", {
        provider,
        vehicles: Math.max(count, chosen.length),
        vehicleIds: chosen
      });
      if (res.provider === "razorpay" && res.shortUrl) window.location.href = res.shortUrl;
      else if (res.provider === "stripe" && res.url) window.location.href = res.url;
      else setPending({ id: res.subscriptionId, warnings: res.warnings });
    } catch (err) {
      notify("Checkout failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sandboxActivate = async (id: string) => {
    try {
      await api.post(`/billing/subscriptions/${id}/sandbox-activate`);
      setPending(null);
      billing.reload();
      void refreshMe();
      notify("Drive activated (sandbox)", "No payment was taken.");
    } catch (err) {
      notify("Couldn't activate", errorMessage(err));
    }
  };

  const assign = async (subId: string, vehicleId: string) => {
    try {
      await api.post(`/billing/subscriptions/${subId}/seats`, { vehicleIds: [vehicleId] });
      billing.reload();
      void refreshMe();
    } catch (err) {
      notify("Couldn't assign", errorMessage(err));
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Billing" title="Plans & seats" description="KAAFILA Drive is ₹500 per car per month. Buy seats once and assign them to your cars — or sponsor every car in a convoy you organise." />
      {params.get("status") === "success" ? <Notice tone="ok">Payment received. Your seats activate as soon as the payment provider confirms (usually within a minute).</Notice> : null}
      {params.get("status") === "cancelled" ? <Notice tone="warn">Checkout was cancelled. Nothing was charged.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_CARDS.map((p) => (
          <Card key={p.code} className={p.code === "drive" ? "border-primary/50 shadow-glow" : undefined}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.name}</p>
            <p className="mt-1 text-3xl font-semibold">{p.priceLabel}</p>
            <p className="text-sm text-muted-foreground">{p.cadence}</p>
            <p className="mt-2 text-sm">{p.tagline}</p>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PricingCalculator />
        {status === "signed_in" && me ? (
          <Card>
            <CardTitle eyebrow="Checkout" title="Get Drive" right={<CreditCard className="h-4 w-4 text-muted-foreground" />} />
            <div className="grid gap-3">
              <Field label="Seats (cars)">
                <Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
              </Field>
              {uncovered.length ? (
                <fieldset className="grid gap-1.5 text-sm">
                  <legend className="mb-1 text-muted-foreground">Cover these cars now (you can assign the rest later)</legend>
                  {uncovered.map((v) => (
                    <label key={v.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-teal-400"
                        checked={chosen.includes(v.id)}
                        onChange={(e) => setChosen((c) => (e.target.checked ? [...c, v.id] : c.filter((x) => x !== v.id)))}
                      />
                      {v.name}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="text-xs text-muted-foreground">All your cars are covered. Extra seats can be assigned to cars in convoys you organise.</p>
              )}
              <Field label="Pay with">
                <Select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                  <option value="razorpay">Razorpay (UPI, cards, netbanking — India)</option>
                  <option value="stripe">Stripe (international cards)</option>
                </Select>
              </Field>
              <Button onClick={checkout} disabled={busy}>
                {busy ? "Starting checkout…" : `Subscribe for ${Math.max(count, chosen.length)} car${Math.max(count, chosen.length) > 1 ? "s" : ""}`}
              </Button>
              <p className="text-xs text-muted-foreground">Monthly, cancel any time; access continues until the end of the paid period.</p>
            </div>
            {pending ? (
              <div className="mt-3 grid gap-2">
                {pending.warnings.map((w) => (
                  <Notice key={w} tone="warn">
                    {w}
                  </Notice>
                ))}
                <Button variant="secondary" onClick={() => sandboxActivate(pending.id)}>
                  Activate in sandbox (development)
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {status === "signed_in" ? (
        <Card>
          <CardTitle eyebrow="Your subscriptions" title="Seats" />
          {billing.data?.subscriptions.length === 0 ? <Empty>No subscriptions yet. Your cars are on Explorer (free).</Empty> : null}
          <div className="grid gap-3">
            {billing.data?.subscriptions.map((s) => {
              const free = s.quantity - s.seats.length;
              return (
                <div key={s.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      Drive · {s.quantity} car{s.quantity > 1 ? "s" : ""} · {inr(s.amountMinor)}/month
                    </p>
                    <span className="flex items-center gap-2">
                      <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "danger" : "neutral"}>{s.status.replace("_", " ")}</Badge>
                      {s.cancelAtPeriodEnd ? <Badge variant="amber">ends {s.currentPeriodEnd ? formatDateTime(s.currentPeriodEnd) : "at period end"}</Badge> : null}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    via {s.provider} · started {formatDateTime(s.createdAt)}
                    {s.currentPeriodEnd && !s.cancelAtPeriodEnd ? ` · renews ${formatDateTime(s.currentPeriodEnd)}` : ""}
                  </p>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {s.seats.map((seat) => (
                      <li key={seat.id} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <CarFront className="h-4 w-4 text-primary" />
                          {seat.vehicle.name}
                          {seat.vehicle.userId !== me?.id ? <span className="text-xs text-muted-foreground">({seat.vehicle.user.displayName})</span> : null}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-rose-300"
                          aria-label={`Remove seat from ${seat.vehicle.name}`}
                          onClick={() => api.del(`/billing/seats/${seat.id}`).then(() => (billing.reload(), refreshMe()), (e) => notify("Couldn't remove", errorMessage(e)))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {s.status === "active" && free > 0 && uncovered.length ? (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{free} free seat(s):</span>
                      <Select className="h-8 w-48" defaultValue="" onChange={(e) => e.target.value && assign(s.id, e.target.value)} aria-label="Assign seat">
                        <option value="">Assign to…</option>
                        {uncovered.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  {s.status === "checkout_pending" ? (
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => sandboxActivate(s.id)}>
                      Activate in sandbox (development)
                    </Button>
                  ) : null}
                  {s.status === "active" && !s.cancelAtPeriodEnd ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() =>
                        window.confirm("Cancel at the end of the current period?") &&
                        api.post(`/billing/subscriptions/${s.id}/cancel`).then(billing.reload, (e) => notify("Couldn't cancel", errorMessage(e)))
                      }
                    >
                      Cancel subscription
                    </Button>
                  ) : null}
                  {s.payments.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last payment {inr(s.payments[0]!.amountMinor)} on {formatDateTime(s.payments[0]!.createdAt)} ({s.payments[0]!.status})
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">To cover a friend's car, add it from a convoy you organise — seats can sponsor any car in your convoys.</p>
        </Card>
      ) : null}
      {view}
    </div>
  );
}
