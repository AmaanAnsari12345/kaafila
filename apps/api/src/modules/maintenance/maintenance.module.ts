import { Controller, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PLAN_LIMITS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { AuditService } from "../../shared/audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";

export interface RetentionReport {
  explorerPings: number;
  drivePings: number;
  fleetPings: number;
  shareLinks: number;
  pairings: number;
  webhookEvents: number;
  roadReports: number;
  assistantMessages: number;
  durationMs: number;
}

const BATCH = 5000;
const MAX_BATCHES_PER_STEP = 40; // caps one run at ~200k rows per step to keep locks short

/**
 * Data retention. Location history is kept only as long as each car's plan allows
 * (Explorer 7 days, Drive 365 days, Fleet 730 days); operational leftovers are purged.
 * Runs hourly on one replica at a time (Redis lock); deletes in small batches.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;
  private firstRun?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if (this.config.get<string>("RETENTION_ENABLED") === "false") return;
    const minutes = Number(this.config.get<string>("RETENTION_INTERVAL_MINUTES") ?? 60) || 60;
    this.firstRun = setTimeout(() => void this.runScheduled(), 60_000);
    this.timer = setInterval(() => void this.runScheduled(), minutes * 60_000);
    this.timer.unref?.();
    this.firstRun.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  private async runScheduled() {
    const locked = await this.redis.throttle("lock:retention", 50 * 60_000).catch(() => false);
    if (!locked) return;
    try {
      const report = await this.run();
      this.logger.log(`retention: ${JSON.stringify(report)}`);
    } catch (err) {
      this.logger.error(`retention failed: ${(err as Error).message}`);
    }
  }

  private async batched(sql: () => Promise<number>) {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_STEP; i++) {
      const n = await sql();
      total += n;
      if (n < BATCH) break;
    }
    return total;
  }

  async run(actorId = "system"): Promise<RetentionReport> {
    const started = Date.now();
    const explorerDays = PLAN_LIMITS.explorer.historyDays;
    const driveDays = PLAN_LIMITS.drive.historyDays;
    const fleetDays = PLAN_LIMITS.fleet.historyDays;

    // Cars without an active paid seat: Explorer window.
    const explorerPings = await this.batched(() =>
      this.prisma.$executeRaw`
        DELETE FROM "LocationPing" WHERE "id" IN (
          SELECT lp."id" FROM "LocationPing" lp
          WHERE lp."capturedAt" < NOW() - make_interval(days => ${explorerDays}::int)
            AND NOT EXISTS (
              SELECT 1 FROM "SubscriptionSeat" s JOIN "Subscription" sub ON sub."id" = s."subscriptionId"
              WHERE s."vehicleId" = lp."vehicleId" AND sub."status" = 'active'
            )
          LIMIT ${BATCH}
        )`
    );
    // Drive cars: 365 days. Fleet cars: 730 days.
    const drivePings = await this.batched(() =>
      this.prisma.$executeRaw`
        DELETE FROM "LocationPing" WHERE "id" IN (
          SELECT lp."id" FROM "LocationPing" lp
          WHERE lp."capturedAt" < NOW() - make_interval(days => ${driveDays}::int)
            AND NOT EXISTS (
              SELECT 1 FROM "SubscriptionSeat" s JOIN "Subscription" sub ON sub."id" = s."subscriptionId"
              WHERE s."vehicleId" = lp."vehicleId" AND sub."status" = 'active' AND sub."plan" = 'fleet'
            )
          LIMIT ${BATCH}
        )`
    );
    const fleetPings = await this.batched(() =>
      this.prisma.$executeRaw`
        DELETE FROM "LocationPing" WHERE "id" IN (
          SELECT "id" FROM "LocationPing" WHERE "capturedAt" < NOW() - make_interval(days => ${fleetDays}::int) LIMIT ${BATCH}
        )`
    );

    const day = 86_400_000;
    const now = Date.now();
    const [shareLinks, pairings, webhookEvents, roadReports, assistantMessages] = await Promise.all([
      this.prisma.shareLink.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now - 30 * day) } }, { revokedAt: { lt: new Date(now - 30 * day) } }] } }),
      this.prisma.devicePairing.deleteMany({ where: { expiresAt: { lt: new Date(now - day) } } }),
      this.prisma.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(now - 90 * day) } } }),
      this.prisma.roadReport.deleteMany({ where: { expiresAt: { lt: new Date(now - 30 * day) } } }),
      this.prisma.assistantMessage.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * day) } } })
    ]);

    const report: RetentionReport = {
      explorerPings,
      drivePings,
      fleetPings,
      shareLinks: shareLinks.count,
      pairings: pairings.count,
      webhookEvents: webhookEvents.count,
      roadReports: roadReports.count,
      assistantMessages: assistantMessages.count,
      durationMs: Date.now() - started
    };
    await this.audit.record(actorId, "retention.run", "platform", "retention", report as unknown as Record<string, unknown>);
    return report;
  }
}

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, AdminGuard)
@Controller("admin/maintenance")
export class MaintenanceController {
  constructor(private readonly retention: RetentionService) {}

  /** Run retention now (normally hourly). */
  @Post("retention")
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.retention.run(user.id);
  }
}

@Module({
  controllers: [MaintenanceController],
  providers: [RetentionService],
  exports: [RetentionService]
})
export class MaintenanceModule {}
