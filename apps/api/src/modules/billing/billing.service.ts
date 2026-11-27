import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type SubscriptionStatus } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import Stripe from "stripe";
import { DRIVE_PRICE_PER_VEHICLE_MINOR, quoteDrive, type TaxMode } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AuditService } from "../../shared/audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { EntitlementsService } from "../core/entitlements.service";

export interface CheckoutInput {
  provider: "razorpay" | "stripe";
  vehicles: number;
  vehicleIds?: string[];
}

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  quantity?: number;
  current_start?: number | null;
  current_end?: number | null;
  notes?: Record<string, string>;
}

interface RazorpayWebhook {
  event: string;
  payload?: {
    subscription?: { entity: RazorpaySubscriptionEntity };
    payment?: { entity: { id: string; amount: number; currency: string; status: string } };
  };
}

const RAZORPAY_STATUS: Record<string, SubscriptionStatus | undefined> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.resumed": "active",
  "subscription.pending": "past_due",
  "subscription.halted": "past_due",
  "subscription.paused": "past_due",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "expired"
};

const STRIPE_STATUS: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "checkout_pending",
  incomplete_expired: "expired",
  canceled: "cancelled",
  paused: "past_due"
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly razorpay?: Razorpay;
  private readonly stripe?: Stripe;
  private readonly taxMode: TaxMode;
  private readonly gstRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService
  ) {
    const keyId = config.get<string>("RAZORPAY_KEY_ID");
    const keySecret = config.get<string>("RAZORPAY_KEY_SECRET");
    if (keyId && keySecret) this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const stripeKey = config.get<string>("STRIPE_SECRET_KEY");
    if (stripeKey) this.stripe = new Stripe(stripeKey);
    this.taxMode = config.get<TaxMode>("PRICE_TAX_MODE") ?? "inclusive";
    this.gstRate = config.get<number>("GST_RATE") ?? 0.18;
  }

  get sandbox() {
    return this.config.get<string>("NODE_ENV") !== "production";
  }

  quote(vehicles: number) {
    return {
      ...quoteDrive(vehicles, this.taxMode, this.gstRate),
      providers: {
        razorpay: Boolean(this.razorpay && this.config.get("RAZORPAY_PLAN_ID_DRIVE")),
        stripe: Boolean(this.stripe && this.config.get("STRIPE_PRICE_ID_DRIVE")),
        sandbox: this.sandbox && !this.razorpay && !this.stripe
      }
    };
  }

  async checkout(user: AuthenticatedUser, input: CheckoutInput) {
    const quote = quoteDrive(input.vehicles, this.taxMode, this.gstRate);
    const vehicleIds = [...new Set(input.vehicleIds ?? [])];
    if (vehicleIds.length > input.vehicles) throw new BadRequestException("More vehicles selected than seats purchased");
    for (const id of vehicleIds) await this.assertCanSponsor(user.id, id);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        plan: "drive",
        provider: input.provider,
        status: "checkout_pending",
        quantity: input.vehicles,
        unitAmountMinor: DRIVE_PRICE_PER_VEHICLE_MINOR,
        amountMinor: quote.totalMinor,
        taxMode: this.taxMode,
        currency: "INR"
      }
    });
    if (vehicleIds.length) await this.redis.cacheJson(`checkout:${subscription.id}:vehicles`, vehicleIds, 7 * 86_400);

    const warnings: string[] = [];
    if (quote.exceedsEmandateLimit) {
      warnings.push(
        `Each monthly charge (₹${(quote.totalMinor / 100).toLocaleString("en-IN")}) is above ₹15,000, so Indian banks will ask you to approve every renewal (RBI e-mandate rules). To keep renewals automatic, split into subscriptions of up to ${quote.maxVehiclesPerMandate} cars.`
      );
    }

    if (input.provider === "razorpay" && this.razorpay) {
      const planId = this.config.get<string>("RAZORPAY_PLAN_ID_DRIVE");
      if (!planId) throw new ServiceUnavailableException("Razorpay plan is not configured (RAZORPAY_PLAN_ID_DRIVE)");
      const rp = await this.razorpay.subscriptions.create({
        plan_id: planId,
        total_count: 60,
        quantity: input.vehicles,
        customer_notify: 1,
        notes: { kaafilaSubscriptionId: subscription.id, userId: user.id }
      });
      await this.prisma.subscription.update({ where: { id: subscription.id }, data: { providerSubId: rp.id } });
      return { provider: "razorpay" as const, subscriptionId: subscription.id, razorpaySubscriptionId: rp.id, keyId: this.config.get<string>("RAZORPAY_KEY_ID"), shortUrl: rp.short_url, quote, warnings };
    }

    if (input.provider === "stripe" && this.stripe) {
      const price = this.config.get<string>("STRIPE_PRICE_ID_DRIVE");
      if (!price) throw new ServiceUnavailableException("Stripe price is not configured (STRIPE_PRICE_ID_DRIVE)");
      const app = this.config.get<string>("PUBLIC_APP_URL");
      const session = await this.stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: input.vehicles }],
        client_reference_id: subscription.id,
        customer_email: user.email,
        metadata: { kaafilaSubscriptionId: subscription.id },
        subscription_data: { metadata: { kaafilaSubscriptionId: subscription.id, userId: user.id } },
        success_url: `${app}/billing?status=success&sub=${subscription.id}`,
        cancel_url: `${app}/billing?status=cancelled&sub=${subscription.id}`
      });
      return { provider: "stripe" as const, subscriptionId: subscription.id, url: session.url, quote, warnings };
    }

    if (this.sandbox) {
      return { provider: "sandbox" as const, subscriptionId: subscription.id, quote, warnings: [...warnings, "Payments are not configured. Development sandbox: activate this subscription without charging."] };
    }
    throw new ServiceUnavailableException(`${input.provider} is not configured`);
  }

  /** Development-only activation so the full seat flow can be tested without a payment provider. */
  async sandboxActivate(user: AuthenticatedUser, subscriptionId: string) {
    if (!this.sandbox) throw new ForbiddenException("Sandbox activation is disabled in production");
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== user.id) throw new NotFoundException("Subscription not found");
    const now = new Date();
    await this.applyStatus(sub.id, "active", now, new Date(now.getTime() + 30 * 86_400_000));
    await this.prisma.payment.create({ data: { subscriptionId: sub.id, provider: sub.provider, providerRef: "sandbox", amountMinor: sub.amountMinor, currency: sub.currency, status: "sandbox" } });
    return this.mine(user.id);
  }

  async mine(userId: string) {
    const [subscriptions, vehicles] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { seats: { include: { vehicle: { select: { id: true, name: true, userId: true, user: { select: { displayName: true } } } } } }, payments: { orderBy: { createdAt: "desc" }, take: 6 } }
      }),
      this.prisma.vehicle.findMany({ where: { userId }, select: { id: true, name: true, seat: { select: { id: true, subscriptionId: true } } } })
    ]);
    return { taxMode: this.taxMode, unitPriceMinor: DRIVE_PRICE_PER_VEHICLE_MINOR, subscriptions, vehicles };
  }

  /** A buyer can cover their own cars and cars of members in convoys they own or lead. */
  private async assertCanSponsor(buyerId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    if (vehicle.userId === buyerId) return;
    const shared = await this.prisma.convoyMember.count({
      where: { vehicleId, status: "active", convoy: { members: { some: { userId: buyerId, role: { in: ["owner", "leader"] }, status: "active" } } } }
    });
    if (!shared) throw new ForbiddenException("You can only cover your own cars or cars in a convoy you organise");
  }

  async assignSeats(user: AuthenticatedUser, subscriptionId: string, vehicleIds: string[]) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { seats: true } });
    if (!sub || sub.userId !== user.id) throw new NotFoundException("Subscription not found");
    if (sub.status !== "active") throw new BadRequestException("Seats can be assigned once the subscription is active");
    const wanted = [...new Set(vehicleIds)].filter((id) => !sub.seats.some((s) => s.vehicleId === id));
    if (sub.seats.length + wanted.length > sub.quantity) throw new BadRequestException(`This subscription covers ${sub.quantity} cars; ${sub.quantity - sub.seats.length} seats are free`);
    for (const id of wanted) await this.assertCanSponsor(user.id, id);

    for (const vehicleId of wanted) {
      try {
        await this.prisma.subscriptionSeat.create({ data: { subscriptionId, vehicleId, assignedById: user.id } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException("That car is already covered by a subscription");
        throw err;
      }
      const owner = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
      await this.entitlements.invalidateVehicle(vehicleId, owner?.userId);
    }
    return this.mine(user.id);
  }

  async unassignSeat(user: AuthenticatedUser, seatId: string) {
    const seat = await this.prisma.subscriptionSeat.findUnique({ where: { id: seatId }, include: { subscription: true, vehicle: { select: { userId: true } } } });
    if (!seat || seat.subscription.userId !== user.id) throw new NotFoundException("Seat not found");
    await this.prisma.subscriptionSeat.delete({ where: { id: seatId } });
    await this.entitlements.invalidateVehicle(seat.vehicleId, seat.vehicle.userId);
    return this.mine(user.id);
  }

  async cancel(user: AuthenticatedUser, subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== user.id) throw new NotFoundException("Subscription not found");
    if (sub.providerSubId && sub.provider === "razorpay" && this.razorpay) await this.razorpay.subscriptions.cancel(sub.providerSubId, true);
    if (sub.providerSubId && sub.provider === "stripe" && this.stripe) await this.stripe.subscriptions.update(sub.providerSubId, { cancel_at_period_end: true });
    if (!sub.providerSubId) {
      await this.applyStatus(sub.id, "cancelled");
      return { ok: true, cancelAtPeriodEnd: false };
    }
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    return { ok: true, cancelAtPeriodEnd: true };
  }

  /** Account deletion: stop all future charges immediately. Payment records are kept for tax law. */
  async cancelAllForUser(userId: string) {
    const subs = await this.prisma.subscription.findMany({ where: { userId, status: { in: ["active", "past_due", "checkout_pending"] } } });
    for (const sub of subs) {
      try {
        if (sub.providerSubId && sub.provider === "razorpay" && this.razorpay) await this.razorpay.subscriptions.cancel(sub.providerSubId, false);
        if (sub.providerSubId && sub.provider === "stripe" && this.stripe) await this.stripe.subscriptions.cancel(sub.providerSubId);
      } catch (err) {
        this.logger.error(`Provider cancel failed for ${sub.id}: ${(err as Error).message}`);
      }
      await this.applyStatus(sub.id, "cancelled");
    }
    return subs.length;
  }

  /* ------------------------------- webhooks -------------------------------- */

  async handleRazorpayWebhook(rawBody: Buffer | undefined, signature: string | undefined, eventIdHeader: string | undefined) {
    const secret = this.config.get<string>("RAZORPAY_WEBHOOK_SECRET");
    if (!secret) throw new ServiceUnavailableException("Razorpay webhook secret is not configured");
    if (!rawBody || !signature) throw new UnauthorizedException("Missing signature");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!this.safeEqual(expected, signature)) throw new UnauthorizedException("Invalid signature");

    const event = JSON.parse(rawBody.toString("utf8")) as RazorpayWebhook;
    const eventId = eventIdHeader ?? createHash("sha256").update(rawBody).digest("hex");
    if (!(await this.firstDelivery("razorpay", eventId, event.event))) return { duplicate: true };

    const entity = event.payload?.subscription?.entity;
    if (!entity) return { ignored: event.event };
    const sub = await this.prisma.subscription.findFirst({
      where: { OR: [{ providerSubId: entity.id }, ...(entity.notes?.kaafilaSubscriptionId ? [{ id: entity.notes.kaafilaSubscriptionId }] : [])] }
    });
    if (!sub) {
      this.logger.warn(`Razorpay webhook for unknown subscription ${entity.id}`);
      return { ignored: "unknown_subscription" };
    }

    const status = RAZORPAY_STATUS[event.event];
    if (status) {
      await this.applyStatus(
        sub.id,
        status,
        entity.current_start ? new Date(entity.current_start * 1000) : undefined,
        entity.current_end ? new Date(entity.current_end * 1000) : undefined,
        entity.id,
        entity.quantity
      );
    }
    const payment = event.payload?.payment?.entity;
    if (event.event === "subscription.charged" && payment) {
      await this.prisma.payment.create({
        data: { subscriptionId: sub.id, provider: "razorpay", providerRef: payment.id, amountMinor: payment.amount, currency: payment.currency, status: payment.status }
      });
    }
    return { ok: true };
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");
    if (!this.stripe || !secret) throw new ServiceUnavailableException("Stripe webhooks are not configured");
    if (!rawBody || !signature) throw new UnauthorizedException("Missing signature");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new UnauthorizedException("Invalid signature");
    }
    if (!(await this.firstDelivery("stripe", event.id, event.type))) return { duplicate: true };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const id = session.client_reference_id ?? session.metadata?.kaafilaSubscriptionId;
        if (id && typeof session.subscription === "string") {
          await this.prisma.subscription.updateMany({
            where: { id },
            data: { providerSubId: session.subscription, providerCustomerId: typeof session.customer === "string" ? session.customer : undefined }
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const s = event.data.object;
        const sub = await this.prisma.subscription.findFirst({ where: { OR: [{ providerSubId: s.id }, ...(s.metadata?.kaafilaSubscriptionId ? [{ id: s.metadata.kaafilaSubscriptionId }] : [])] } });
        if (!sub) break;
        const status = event.type === "customer.subscription.deleted" ? "cancelled" : (STRIPE_STATUS[s.status] ?? "past_due");
        const loose = s as unknown as { current_period_start?: number; current_period_end?: number };
        await this.applyStatus(
          sub.id,
          status,
          loose.current_period_start ? new Date(loose.current_period_start * 1000) : undefined,
          loose.current_period_end ? new Date(loose.current_period_end * 1000) : undefined,
          s.id,
          s.items.data[0]?.quantity ?? undefined
        );
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: s.cancel_at_period_end } });
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        const sub = subId ? await this.prisma.subscription.findFirst({ where: { providerSubId: subId } }) : null;
        if (sub) {
          await this.prisma.payment.create({
            data: { subscriptionId: sub.id, provider: "stripe", providerRef: invoice.id, amountMinor: invoice.amount_paid, currency: invoice.currency.toUpperCase(), status: "paid" }
          });
        }
        break;
      }
      default:
        break;
    }
    return { ok: true };
  }

  private async firstDelivery(provider: "razorpay" | "stripe", eventId: string, type: string) {
    try {
      await this.prisma.webhookEvent.create({ data: { provider, eventId, type } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  }

  private async applyStatus(subscriptionId: string, status: SubscriptionStatus, periodStart?: Date, periodEnd?: Date, providerSubId?: string, quantity?: number) {
    const sub = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status,
        ...(periodStart ? { currentPeriodStart: periodStart } : {}),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
        ...(providerSubId ? { providerSubId } : {}),
        ...(quantity ? { quantity } : {})
      },
      include: { seats: { include: { vehicle: { select: { userId: true } } } } }
    });

    if (status === "active" && sub.seats.length === 0) {
      const requested = (await this.redis.getJson<string[]>(`checkout:${sub.id}:vehicles`)) ?? [];
      const fallback = requested.length ? requested : (await this.prisma.vehicle.findMany({ where: { userId: sub.userId, seat: null }, select: { id: true }, take: sub.quantity })).map((v) => v.id);
      for (const vehicleId of fallback.slice(0, sub.quantity)) {
        await this.prisma.subscriptionSeat.create({ data: { subscriptionId: sub.id, vehicleId, assignedById: sub.userId } }).catch(() => undefined);
        const owner = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { userId: true } });
        await this.entitlements.invalidateVehicle(vehicleId, owner?.userId);
      }
    }
    for (const seat of sub.seats) await this.entitlements.invalidateVehicle(seat.vehicleId, seat.vehicle.userId);
    await this.audit.record("system", `subscription.${status}`, "subscription", sub.id, { periodEnd: periodEnd?.toISOString() });
  }

  private safeEqual(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
