import { Module } from "@nestjs/common";
import { ConvoysModule } from "../convoys/convoys.module";
import { SafetyModule } from "../safety/safety.module";
import { TrackingModule } from "../tracking/tracking.module";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [TrackingModule, ConvoysModule, SafetyModule],
  providers: [RealtimeGateway]
})
export class RealtimeModule {}
