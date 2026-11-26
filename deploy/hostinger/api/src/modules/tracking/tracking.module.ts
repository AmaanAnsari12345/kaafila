import { Module } from "@nestjs/common";
import { PublicFollowController, TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";

@Module({
  controllers: [TrackingController, PublicFollowController],
  providers: [TrackingService],
  exports: [TrackingService]
})
export class TrackingModule {}
