import { Injectable } from "@nestjs/common";
import { PLAN_LIMITS, type PlanCode, type PlanLimits } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";

const CACHE_SECONDS = 60;

/**
 * Server-side source of truth for what a vehicle (and its driver) may do.
 * A vehicle is on Drive/Fleet when it holds a seat on an active, unexpired subscription.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async planForVehicle(vehicleId: string | null | undefined): Promise<PlanCode> {
    if (!vehicleId) return "explorer";
    return this.redis.remember(`ent:veh:${vehicleId}`, CACHE_SECONDS, async () => {
      const seat = await this.prisma.subscriptionSeat.findUnique({
        where: { vehicleId },
        include: { subscription: { select: { status: true, plan: true, currentPeriodEnd: true } } }
      });
      const sub = seat?.subscription;
      if (!sub || sub.status !== "active") return "explorer" as PlanCode;
      if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return "explorer" as PlanCode;
      return sub.plan;
    });
  }

  async limitsForVehicle(vehicleId: string | null | undefined): Promise<PlanLimits & { plan: PlanCode }> {
    const plan = await this.planForVehicle(vehicleId);
    return { plan, ...PLAN_LIMITS[plan] };
  }

  /** A user has Drive features when any vehicle they own holds an active seat. */
  async planForUser(userId: string): Promise<PlanCode> {
    return this.redis.remember(`ent:usr:${userId}`, CACHE_SECONDS, async () => {
      const seat = await this.prisma.subscriptionSeat.findFirst({
        where: {
          vehicle: { userId },
          subscription: { status: "active", OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] }
        },
        include: { subscription: { select: { plan: true } } }
      });
      return (seat?.subscription.plan ?? "explorer") as PlanCode;
    });
  }

  async invalidateVehicle(vehicleId: string, ownerId?: string) {
    const keys = [`ent:veh:${vehicleId}`];
    if (ownerId) keys.push(`ent:usr:${ownerId}`);
    await this.redis.client.del(...keys).catch(() => undefined);
  }
}
