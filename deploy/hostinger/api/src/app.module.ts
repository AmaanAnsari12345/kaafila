import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env.validation";
import { AdminModule } from "./modules/admin/admin.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ConvoysModule } from "./modules/convoys/convoys.module";
import { CoreModule } from "./modules/core/core.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { GarageModule } from "./modules/garage/garage.module";
import { HealthModule } from "./modules/health/health.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { IntelModule } from "./modules/intel/intel.module";
import { JourneysModule } from "./modules/journeys/journeys.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { MeetupsModule } from "./modules/meetups/meetups.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { RoadsideModule } from "./modules/roadside/roadside.module";
import { SafetyModule } from "./modules/safety/safety.module";
import { SocialModule } from "./modules/social/social.module";
import { TrackingModule } from "./modules/tracking/tracking.module";
import { UsersModule } from "./modules/users/users.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { AuditModule } from "./shared/audit/audit.service";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { RedisModule } from "./shared/redis/redis.module";
import { HttpThrottlerGuard } from "./shared/throttle/http-throttler.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    CoreModule,
    IntegrationsModule,
    NotificationsModule,
    UsersModule,
    GarageModule,
    DevicesModule,
    ConvoysModule,
    TrackingModule,
    IntelModule,
    SafetyModule,
    RoadsideModule,
    ExpensesModule,
    SocialModule,
    MeetupsModule,
    AssistantModule,
    VoiceModule,
    JourneysModule,
    BillingModule,
    AdminModule,
    PlatformModule,
    MaintenanceModule,
    RealtimeModule,
    HealthModule
  ],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }]
})
export class AppModule {}
