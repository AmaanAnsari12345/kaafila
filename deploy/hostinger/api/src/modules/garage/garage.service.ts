import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { documentStatus, interpretObd, OBD_PIDS, reminderStatus, rollReminder, type ObdMetric } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { EntitlementsService } from "../core/entitlements.service";
import type { CreateVehicleDto, DocumentDto, MaintenanceDto, ReminderDto, TelemetryDto, UpdateVehicleDto } from "./garage.dto";

const OBD_METRICS = new Set<string>(OBD_PIDS.map((p) => p.metric));

@Injectable()
export class GarageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly entitlements: EntitlementsService
  ) {}

  private async owned(userId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");
    if (vehicle.userId !== userId) throw new ForbiddenException("Not your vehicle");
    return vehicle;
  }

  async list(userId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { reminders: true, documents: true, seat: { include: { subscription: { select: { status: true, currentPeriodEnd: true } } } } }
    });
    const plans = await Promise.all(vehicles.map((v) => this.entitlements.planForVehicle(v.id)));
    return vehicles.map((v, i) => {
      const reminders = v.reminders.map((r) => ({ ...r, status: reminderStatus({ dueAtIso: r.dueAt?.toISOString(), dueOdometerKm: r.dueOdometerKm }, v.odometerKm) }));
      const documents = v.documents.map((d) => ({ ...d, status: documentStatus(d.expiresAt?.toISOString()) }));
      return {
        ...v,
        plan: plans[i],
        reminders,
        documents,
        attention: reminders.filter((r) => r.status.state !== "ok").length + documents.filter((d) => d.status.state === "expired" || d.status.state === "expiring").length
      };
    });
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const count = await this.prisma.vehicle.count({ where: { userId } });
    if (count >= 25) throw new BadRequestException("A garage can hold up to 25 vehicles");
    return this.prisma.$transaction(async (tx) => {
      const makeDefault = dto.isDefault || count === 0;
      if (makeDefault) await tx.vehicle.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.vehicle.create({ data: { ...dto, userId, isDefault: makeDefault } });
    });
  }

  async update(userId: string, vehicleId: string, dto: UpdateVehicleDto) {
    await this.owned(userId, vehicleId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.vehicle.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.vehicle.update({ where: { id: vehicleId }, data: dto });
    });
    await this.redis.client.del(`vmeta:${vehicleId}`).catch(() => undefined);
    return updated;
  }

  async remove(userId: string, vehicleId: string) {
    await this.owned(userId, vehicleId);
    const active = await this.prisma.convoyMember.count({ where: { vehicleId, status: "active", convoy: { status: { in: ["boarding", "active", "paused"] } } } });
    if (active) throw new BadRequestException("This vehicle is in a live convoy; leave the convoy first");
    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
    return { ok: true };
  }

  async detail(userId: string, vehicleId: string) {
    const vehicle = await this.owned(userId, vehicleId);
    const [maintenance, reminders, documents, telemetry, plan] = await Promise.all([
      this.prisma.maintenanceRecord.findMany({ where: { vehicleId }, orderBy: { performedAt: "desc" }, take: 100 }),
      this.prisma.serviceReminder.findMany({ where: { vehicleId }, orderBy: { dueAt: "asc" } }),
      this.prisma.vehicleDocument.findMany({ where: { vehicleId }, orderBy: { expiresAt: "asc" } }),
      this.prisma.vehicleTelemetry.findFirst({ where: { vehicleId }, orderBy: { capturedAt: "desc" } }),
      this.entitlements.planForVehicle(vehicleId)
    ]);
    const spendMinor = maintenance.reduce((s, m) => s + (m.costMinor ?? 0), 0);
    return {
      vehicle,
      plan,
      spendMinor,
      maintenance,
      reminders: reminders.map((r) => ({ ...r, status: reminderStatus({ dueAtIso: r.dueAt?.toISOString(), dueOdometerKm: r.dueOdometerKm }, vehicle.odometerKm) })),
      documents: documents.map((d) => ({ ...d, status: documentStatus(d.expiresAt?.toISOString()) })),
      lastTelemetry: telemetry
        ? { ...telemetry, flags: interpretObd(telemetry.readings as Partial<Record<ObdMetric, number>>, telemetry.dtcs) }
        : null
    };
  }

  async addMaintenance(userId: string, vehicleId: string, dto: MaintenanceDto) {
    const vehicle = await this.owned(userId, vehicleId);
    const { reminderId, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.maintenanceRecord.create({ data: { ...data, performedAt: new Date(dto.performedAt), vehicleId } });
      if (dto.odometerKm && (!vehicle.odometerKm || dto.odometerKm > vehicle.odometerKm)) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: { odometerKm: dto.odometerKm } });
      }
      if (reminderId) {
        const reminder = await tx.serviceReminder.findFirst({ where: { id: reminderId, vehicleId } });
        if (reminder) {
          const next = rollReminder(reminder.intervalDays, reminder.intervalKm, dto.performedAt, dto.odometerKm ?? vehicle.odometerKm);
          await tx.serviceReminder.update({
            where: { id: reminder.id },
            data: {
              lastDoneAt: new Date(dto.performedAt),
              lastDoneOdometerKm: dto.odometerKm,
              dueAt: next.dueAtIso ? new Date(next.dueAtIso) : null,
              dueOdometerKm: next.dueOdometerKm
            }
          });
        }
      }
      return record;
    });
  }

  async deleteMaintenance(userId: string, vehicleId: string, id: string) {
    await this.owned(userId, vehicleId);
    await this.prisma.maintenanceRecord.deleteMany({ where: { id, vehicleId } });
    return { ok: true };
  }

  async addReminder(userId: string, vehicleId: string, dto: ReminderDto) {
    await this.owned(userId, vehicleId);
    if (!dto.dueAt && dto.dueOdometerKm === undefined) throw new BadRequestException("Set a due date, a due odometer reading, or both");
    return this.prisma.serviceReminder.create({ data: { ...dto, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, vehicleId } });
  }

  async deleteReminder(userId: string, vehicleId: string, id: string) {
    await this.owned(userId, vehicleId);
    await this.prisma.serviceReminder.deleteMany({ where: { id, vehicleId } });
    return { ok: true };
  }

  async addDocument(userId: string, vehicleId: string, dto: DocumentDto) {
    await this.owned(userId, vehicleId);
    return this.prisma.vehicleDocument.create({ data: { ...dto, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined, vehicleId } });
  }

  async deleteDocument(userId: string, vehicleId: string, id: string) {
    await this.owned(userId, vehicleId);
    await this.prisma.vehicleDocument.deleteMany({ where: { id, vehicleId } });
    return { ok: true };
  }

  /** OBD readings. Explorer cars get live interpretation only; Drive cars also keep history. */
  async telemetry(userId: string, vehicleId: string, dto: TelemetryDto) {
    await this.owned(userId, vehicleId);
    const readings = Object.fromEntries(Object.entries(dto.readings).filter(([k, v]) => OBD_METRICS.has(k) && Number.isFinite(v)));
    const flags = interpretObd(readings as Partial<Record<ObdMetric, number>>, dto.dtcs ?? []);
    const limits = await this.entitlements.limitsForVehicle(vehicleId);
    if (limits.obdTelemetryHistory && (await this.redis.throttle(`tele:${vehicleId}`, 15_000))) {
      await this.prisma.vehicleTelemetry.create({
        data: { vehicleId, readings: readings as Prisma.InputJsonObject, dtcs: dto.dtcs ?? [], capturedAt: new Date() }
      });
    }
    if (dto.odometerKm) await this.prisma.vehicle.updateMany({ where: { id: vehicleId, OR: [{ odometerKm: null }, { odometerKm: { lt: dto.odometerKm } }] }, data: { odometerKm: dto.odometerKm } });
    return { stored: limits.obdTelemetryHistory, flags };
  }

  async telemetryHistory(userId: string, vehicleId: string) {
    await this.owned(userId, vehicleId);
    return this.prisma.vehicleTelemetry.findMany({ where: { vehicleId }, orderBy: { capturedAt: "desc" }, take: 200 });
  }

  /** Public garage showcase for social profiles. */
  async showcase(userId: string) {
    return this.prisma.vehicle.findMany({
      where: { userId, isShowcase: true },
      select: {
        id: true,
        name: true,
        type: true,
        make: true,
        model: true,
        year: true,
        color: true,
        photoUrl: true,
        fuelType: true,
        mods: { select: { id: true, category: true, name: true, brand: true }, orderBy: { category: "asc" }, take: 30 }
      }
    });
  }
}
