import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import { EntitlementsService } from "../core/entitlements.service";
import type { UpdateProfileDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly entitlements: EntitlementsService
  ) {}

  async getProfile(id: string) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        include: { vehicles: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, _count: { select: { followers: true, following: true } } }
      }),
      this.entitlements.planForUser(id)
    ]);
    return { ...user, plan };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    try {
      const user = await this.prisma.user.update({ where: { id }, data: { ...dto, handle: dto.handle?.toLowerCase() } });
      // Names are cached on live vehicle state.
      const vehicles = await this.prisma.vehicle.findMany({ where: { userId: id }, select: { id: true } });
      if (vehicles.length) await this.redis.client.del(...vehicles.map((v) => `vmeta:${v.id}`)).catch(() => undefined);
      return user;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConflictException("That handle or phone number is already taken");
      throw err;
    }
  }

  /** Data export (DPDP Act / GDPR access request). */
  async exportData(id: string) {
    const [user, vehicles, memberships, sos, posts, expenses, subscriptions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id } }),
      this.prisma.vehicle.findMany({ where: { userId: id }, include: { maintenance: true, reminders: true, documents: true } }),
      this.prisma.convoyMember.findMany({ where: { userId: id }, include: { convoy: { select: { id: true, name: true, createdAt: true } } } }),
      this.prisma.sosIncident.findMany({ where: { userId: id } }),
      this.prisma.post.findMany({ where: { authorId: id } }),
      this.prisma.expense.findMany({ where: { paidById: id } }),
      this.prisma.subscription.findMany({ where: { userId: id }, include: { payments: true } })
    ]);
    return { exportedAtIso: new Date().toISOString(), user, vehicles, memberships, sos, posts, expenses, subscriptions };
  }
}
