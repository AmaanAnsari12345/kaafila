import { Body, Controller, Delete, Get, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { CreateVehicleDto, DocumentDto, MaintenanceDto, ReminderDto, TelemetryDto, UpdateVehicleDto } from "./garage.dto";
import { GarageService } from "./garage.service";
import { EnthusiastController, EnthusiastService } from "./enthusiast.controller";

@ApiTags("garage")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("garage")
export class GarageController {
  constructor(private readonly garage: GarageService) {}

  @Get("vehicles")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.garage.list(user.id);
  }

  @Post("vehicles")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVehicleDto) {
    return this.garage.create(user.id, dto);
  }

  @Get("vehicles/:id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.garage.detail(user.id, id);
  }

  @Patch("vehicles/:id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateVehicleDto) {
    return this.garage.update(user.id, id, dto);
  }

  @Delete("vehicles/:id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.garage.remove(user.id, id);
  }

  @Post("vehicles/:id/maintenance")
  addMaintenance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: MaintenanceDto) {
    return this.garage.addMaintenance(user.id, id, dto);
  }

  @Delete("vehicles/:id/maintenance/:recordId")
  deleteMaintenance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("recordId") recordId: string) {
    return this.garage.deleteMaintenance(user.id, id, recordId);
  }

  @Post("vehicles/:id/reminders")
  addReminder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReminderDto) {
    return this.garage.addReminder(user.id, id, dto);
  }

  @Delete("vehicles/:id/reminders/:reminderId")
  deleteReminder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("reminderId") reminderId: string) {
    return this.garage.deleteReminder(user.id, id, reminderId);
  }

  @Post("vehicles/:id/documents")
  addDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: DocumentDto) {
    return this.garage.addDocument(user.id, id, dto);
  }

  @Delete("vehicles/:id/documents/:documentId")
  deleteDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("documentId") documentId: string) {
    return this.garage.deleteDocument(user.id, id, documentId);
  }

  @Post("vehicles/:id/telemetry")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  telemetry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: TelemetryDto) {
    return this.garage.telemetry(user.id, id, dto);
  }

  @Get("vehicles/:id/telemetry")
  telemetryHistory(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.garage.telemetryHistory(user.id, id);
  }
}

@Module({
  controllers: [GarageController, EnthusiastController],
  providers: [GarageService, EnthusiastService],
  exports: [GarageService]
})
export class GarageModule {}
