import { Controller, Get, Module, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { TrackingModule } from "../tracking/tracking.module";
import { IntelService } from "./intel.service";

@ApiTags("intel")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("intel")
export class IntelController {
  constructor(private readonly intel: IntelService) {}

  /** Formation, Elastic Band, Weakest-Link Range, fatigue, Fair Regroup and Dead-Zone Forecast in one report. */
  @Get("convoys/:convoyId")
  report(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.intel.forConvoy(user, convoyId);
  }
}

@Module({
  imports: [TrackingModule],
  controllers: [IntelController],
  providers: [IntelService],
  exports: [IntelService]
})
export class IntelModule {}
