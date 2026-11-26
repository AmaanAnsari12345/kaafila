import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { CreateJourneyEventDto } from "./dto/create-journey-event.dto";
import { JourneysService } from "./journeys.service";

@ApiTags("journeys")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("journeys")
export class JourneysController {
  constructor(private readonly journeys: JourneysService) {}

  @Post("convoys/:convoyId/start")
  start(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.journeys.start(user, convoyId);
  }

  @Get("convoys/:convoyId")
  forConvoy(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    return this.journeys.forConvoy(user, convoyId);
  }

  @Post("events")
  addEvent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJourneyEventDto) {
    return this.journeys.addEvent(user, dto);
  }

  @Post(":journeyId/complete")
  complete(@CurrentUser() user: AuthenticatedUser, @Param("journeyId") journeyId: string) {
    return this.journeys.complete(user, journeyId);
  }

  @Get(":journeyId/replay")
  replay(@CurrentUser() user: AuthenticatedUser, @Param("journeyId") journeyId: string) {
    return this.journeys.getReplay(user, journeyId);
  }

  @Get(":journeyId/report")
  report(@CurrentUser() user: AuthenticatedUser, @Param("journeyId") journeyId: string) {
    return this.journeys.getReport(user, journeyId);
  }
}
