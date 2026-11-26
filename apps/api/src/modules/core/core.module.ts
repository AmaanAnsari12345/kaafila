import { Global, Module } from "@nestjs/common";
import { ConvoyAccessService } from "./convoy-access.service";
import { EntitlementsService } from "./entitlements.service";
import { RealtimeBus } from "./realtime-bus.service";

@Global()
@Module({
  providers: [ConvoyAccessService, EntitlementsService, RealtimeBus],
  exports: [ConvoyAccessService, EntitlementsService, RealtimeBus]
})
export class CoreModule {}
