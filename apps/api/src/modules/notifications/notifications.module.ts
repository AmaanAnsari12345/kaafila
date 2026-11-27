import { Body, Controller, Delete, Get, Global, HttpCode, Injectable, Logger, Module, Post, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import webpush, { type WebPushError } from "web-push";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";

class PushKeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

class PushSubscriptionDto {
  @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: false }) @MaxLength(1000) endpoint!: string;
  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
  @IsOptional() @IsString() @MaxLength(300) userAgent?: string;
}

class EndpointDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** path inside the app to open when tapped */
  url?: string;
  /** notifications with the same tag replace each other */
  tag?: string;
  /** keep on screen until the user acts (SOS) */
  requireInteraction?: boolean;
}

/**
 * Web Push (VAPID) for alerts that must reach people when KAAFILA is not on screen:
 * SOS in your convoy, critical quick signals, waitlist promotions.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  readonly publicKey?: string;
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const publicKey = config.get<string>("VAPID_PUBLIC_KEY");
    const privateKey = config.get<string>("VAPID_PRIVATE_KEY");
    const subject = config.get<string>("VAPID_SUBJECT");
    this.enabled = Boolean(publicKey && privateKey && subject);
    if (this.enabled) {
      webpush.setVapidDetails(subject!, publicKey!, privateKey!);
      this.publicKey = publicKey;
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: dto.userAgent, failureCount: 0 },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: dto.userAgent },
      select: { id: true, createdAt: true }
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  /** Fire-and-forget delivery; never throws into the caller's request. */
  notifyUsers(userIds: string[], payload: PushPayload) {
    if (!this.enabled || userIds.length === 0) return;
    void this.deliver([...new Set(userIds)], payload).catch((err) => this.logger.warn(`push delivery failed: ${(err as Error).message}`));
  }

  async deliver(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
    if (!this.enabled) return { sent: 0, failed: 0 };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds }, user: { deletedAt: null } } });
    const body = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: payload.requireInteraction ? 600 : 300,
            urgency: payload.requireInteraction ? "high" : "normal"
          });
          sent++;
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } }).catch(() => undefined);
        } catch (err) {
          failed++;
          const status = (err as WebPushError).statusCode;
          // 404/410: the browser dropped the subscription. Repeated failures: stop trying.
          if (status === 404 || status === 410 || s.failureCount >= 5) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }).catch(() => undefined);
          }
        }
      })
    );
    return { sent, failed };
  }
}

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Public: the browser needs this key to create a push subscription. */
  @Get("vapid-public-key")
  key() {
    return { enabled: this.notifications.isEnabled, publicKey: this.notifications.publicKey ?? null };
  }

  @Post("push-subscriptions")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: PushSubscriptionDto) {
    if (!this.notifications.isEnabled) throw new ServiceUnavailableException("Push notifications are not configured on this server");
    return this.notifications.subscribe(user.id, dto);
  }

  @Delete("push-subscriptions")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: EndpointDto) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }

  @Post("test")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  test(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.deliver([user.id], { title: "KAAFILA alerts are on", body: "You'll get SOS and critical convoy alerts even when the app is closed.", url: "/drive", tag: "test" });
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
