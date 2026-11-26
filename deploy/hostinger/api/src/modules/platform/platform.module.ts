import { Controller, Get, Module, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import { PLAN_CARDS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";

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

  /** Flags evaluated for the caller: a stable hash of (key, userId) decides percentage rollouts. */
  @Get("flags")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async flags(@CurrentUser() user: AuthenticatedUser) {
    const flags = await this.redis.remember("flags:all", 30, () => this.prisma.featureFlag.findMany({ select: { key: true, enabled: true, rolloutPct: true } }));
    return Object.fromEntries(
      flags.map((f) => {
        const bucket = parseInt(createHash("sha1").update(`${f.key}:${user.id}`).digest("hex").slice(0, 8), 16) % 100;
        return [f.key, f.enabled && bucket < f.rolloutPct];
      })
    );
  }
}

@Module({ controllers: [PlatformController] })
export class PlatformModule {}
