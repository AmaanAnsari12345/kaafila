import { Controller, Get, Module, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FEATURE_REGISTRY, isFeatureOn, PLAN_CARDS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";

type FlagRow = { key: string; enabled: boolean; rolloutPct: number };

@ApiTags("platform")
@Controller("platform")
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get("plans")
  plans() {
    return PLAN_CARDS;
  }

  /** Public roadmap: what's live, in beta and planned. */
  @Get("features")
  features() {
    return FEATURE_REGISTRY.map(({ key, name, description, stage, target }) => ({ key, name, description, stage, target }));
  }

  @Get("announcements")
  announcements(@Query("country") country?: string) {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        AND: [{ OR: [{ countryCode: null }, ...(country ? [{ countryCode: country.toUpperCase().slice(0, 2) }] : [])] }]
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, severity: true, createdAt: true }
    });
  }

  /**
   * Flags evaluated for the caller. Registry defaults apply until an admin saves an override;
   * a stable hash of (key, userId) decides percentage rollouts (same function as the web app).
   */
  @Get("flags")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async flags(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.redis.remember<FlagRow[]>("flags:all", 30, () => this.prisma.featureFlag.findMany({ select: { key: true, enabled: true, rolloutPct: true } }));
    const overrides = new Map(rows.map((r) => [r.key, r]));
    const result: Record<string, boolean> = {};
    for (const def of FEATURE_REGISTRY) {
      const o = overrides.get(def.key);
      result[def.key] = isFeatureOn(o?.enabled ?? def.defaultEnabled, o?.rolloutPct ?? def.defaultRolloutPct, def.key, user.id);
    }
    for (const r of rows) if (!(r.key in result)) result[r.key] = isFeatureOn(r.enabled, r.rolloutPct, r.key, user.id);
    return result;
  }
}

@Module({ controllers: [PlatformController] })
export class PlatformModule {}
