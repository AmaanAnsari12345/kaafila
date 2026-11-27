import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsDateString, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { RealtimeBus } from "../core/realtime-bus.service";
import { NotificationsService } from "../notifications/notifications.module";

class CreateMeetupDto {
  @IsString() @Length(4, 100) title!: string;
  @IsString() @Length(10, 3000) description!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsString() @Length(2, 120) venueName!: string;
  @IsOptional() @IsString() @MaxLength(240) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsInt() @Min(2) @Max(5000) capacity!: number;
  @IsOptional() @IsString() @MaxLength(40) clubId?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(500) coverUrl?: string;
}

class RsvpDto {
  @IsOptional() @IsString() @MaxLength(40) vehicleId?: string;
}

class CheckInDto {
  @IsString() @Matches(/^[A-Z0-9]{6}$/) code!: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

@Injectable()
export class MeetupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: RealtimeBus,
    private readonly notifications: NotificationsService
  ) {}

  list(city?: string) {
    return this.prisma.meetup.findMany({
      where: { status: "published", startsAt: { gt: new Date(Date.now() - 6 * 3600_000) }, ...(city ? { city: { contains: city, mode: "insensitive" } } : {}) },
      orderBy: { startsAt: "asc" },
      take: 60,
      include: { host: { select: { id: true, displayName: true, handle: true } }, club: { select: { name: true, slug: true } }, _count: { select: { rsvps: { where: { status: { in: ["going", "checked_in"] } } } } } }
    });
  }

  async mine(userId: string) {
    const [hosting, attending] = await Promise.all([
      this.prisma.meetup.findMany({ where: { hostId: userId }, orderBy: { startsAt: "desc" }, take: 50 }),
      this.prisma.meetupRsvp.findMany({ where: { userId, status: { not: "cancelled" } }, include: { meetup: true }, orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    return { hosting, attending };
  }

  async detail(user: AuthenticatedUser, id: string) {
    const meetup = await this.prisma.meetup.findUnique({
      where: { id },
      include: { host: { select: { id: true, displayName: true, handle: true, avatarUrl: true } }, club: { select: { name: true, slug: true } } }
    });
    if (!meetup) throw new NotFoundException("Meetup not found");
    const isHost = meetup.hostId === user.id;
    const isStaff = user.role !== "user";
    if (meetup.status !== "published" && meetup.status !== "completed" && !isHost && !isStaff) throw new NotFoundException("Meetup not found");

    const [going, waitlist, mine] = await Promise.all([
      this.prisma.meetupRsvp.count({ where: { meetupId: id, status: { in: ["going", "checked_in"] } } }),
      this.prisma.meetupRsvp.count({ where: { meetupId: id, status: "waitlist" } }),
      this.prisma.meetupRsvp.findUnique({ where: { meetupId_userId: { meetupId: id, userId: user.id } } })
    ]);
    const attendees =
      isHost || isStaff
        ? await this.prisma.meetupRsvp.findMany({ where: { meetupId: id, status: { not: "cancelled" } }, include: { user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" } })
        : undefined;
    const { checkInCode, ...rest } = meetup;
    return { ...rest, checkInCode: isHost || isStaff ? checkInCode : undefined, going, waitlist, myRsvp: mine, isHost, attendees };
  }

  async create(user: AuthenticatedUser, dto: CreateMeetupDto) {
    if (Date.parse(dto.startsAt) < Date.now() + 3600_000) throw new BadRequestException("Meetups must start at least an hour from now");
    if (dto.endsAt && Date.parse(dto.endsAt) <= Date.parse(dto.startsAt)) throw new BadRequestException("End time must be after the start");
    if (dto.clubId) {
      const member = await this.prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: dto.clubId, userId: user.id } } });
      if (!member) throw new ForbiddenException("You must be a club member to host for it");
    }
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const meetup = await this.prisma.meetup.create({
      data: { ...dto, countryCode: dto.countryCode?.toUpperCase(), startsAt: new Date(dto.startsAt), endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined, hostId: user.id, status: "pending_review", checkInCode: code, rsvps: { create: { userId: user.id, status: "going" } } }
    });
    this.bus.toStaff("meetup:pending", { id: meetup.id, title: meetup.title });
    return meetup;
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const meetup = await this.prisma.meetup.findUnique({ where: { id } });
    if (!meetup) throw new NotFoundException("Meetup not found");
    if (meetup.hostId !== user.id && user.role === "user") throw new ForbiddenException("Only the host can cancel");
    await this.prisma.meetup.update({ where: { id }, data: { status: "cancelled" } });
    return { ok: true };
  }

  async rsvp(user: AuthenticatedUser, id: string, dto: RsvpDto) {
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId }, select: { userId: true } });
      if (v?.userId !== user.id) throw new ForbiddenException("Pick one of your vehicles");
    }
    return this.prisma.$transaction(
      async (tx) => {
        const meetup = await tx.meetup.findUnique({ where: { id } });
        if (!meetup || meetup.status !== "published") throw new NotFoundException("Meetup is not open for RSVPs");
        if (meetup.startsAt.getTime() < Date.now()) throw new BadRequestException("This meetup has already started");
        const existing = await tx.meetupRsvp.findUnique({ where: { meetupId_userId: { meetupId: id, userId: user.id } } });
        if (existing && existing.status !== "cancelled") return existing;
        const going = await tx.meetupRsvp.count({ where: { meetupId: id, status: { in: ["going", "checked_in"] } } });
        const status = going < meetup.capacity ? "going" : "waitlist";
        return tx.meetupRsvp.upsert({
          where: { meetupId_userId: { meetupId: id, userId: user.id } },
          update: { status, vehicleId: dto.vehicleId },
          create: { meetupId: id, userId: user.id, vehicleId: dto.vehicleId, status }
        });
      },
      { isolationLevel: "Serializable" }
    );
  }

  async cancelRsvp(user: AuthenticatedUser, id: string) {
    const rsvp = await this.prisma.meetupRsvp.findUnique({ where: { meetupId_userId: { meetupId: id, userId: user.id } } });
    if (!rsvp || rsvp.status === "cancelled") return { ok: true };
    const meetup = await this.prisma.meetup.findUnique({ where: { id }, select: { hostId: true } });
    if (meetup?.hostId === user.id) throw new BadRequestException("Hosts cannot un-RSVP; cancel the meetup instead");
    await this.prisma.meetupRsvp.update({ where: { id: rsvp.id }, data: { status: "cancelled" } });
    if (rsvp.status === "going") {
      const next = await this.prisma.meetupRsvp.findFirst({ where: { meetupId: id, status: "waitlist" }, orderBy: { createdAt: "asc" } });
      if (next) {
        await this.prisma.meetupRsvp.update({ where: { id: next.id }, data: { status: "going" } });
        this.bus.toUser(next.userId, "meetup:promoted", { meetupId: id });
        this.notifications.notifyUsers([next.userId], { title: "You're in!", body: "A spot opened up at a meetup you waitlisted for.", url: `/meetups/${id}`, tag: `meetup-${id}` });
      }
    }
    return { ok: true };
  }

  async checkIn(user: AuthenticatedUser, id: string, dto: CheckInDto) {
    const meetup = await this.prisma.meetup.findUnique({ where: { id } });
    if (!meetup || meetup.status !== "published") throw new NotFoundException("Meetup not found");
    if (meetup.checkInCode !== dto.code) throw new BadRequestException("Wrong check-in code");
    const opensAt = meetup.startsAt.getTime() - 2 * 3600_000;
    if (Date.now() < opensAt) throw new BadRequestException("Check-in opens 2 hours before the start");
    const rsvp = await this.prisma.meetupRsvp.findUnique({ where: { meetupId_userId: { meetupId: id, userId: user.id } } });
    if (!rsvp || rsvp.status !== "going") throw new ForbiddenException(rsvp?.status === "checked_in" ? "Already checked in" : "You need a confirmed RSVP to check in");
    return this.prisma.meetupRsvp.update({ where: { id: rsvp.id }, data: { status: "checked_in", checkedInAt: new Date() } });
  }
}

@ApiTags("meetups")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("meetups")
export class MeetupsController {
  constructor(private readonly meetups: MeetupsService) {}

  @Get()
  list(@Query("city") city?: string) {
    return this.meetups.list(city?.slice(0, 80));
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.meetups.mine(user.id);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.meetups.detail(user, id);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeetupDto) {
    return this.meetups.create(user, dto);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.meetups.cancel(user, id);
  }

  @Post(":id/rsvp")
  rsvp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RsvpDto) {
    return this.meetups.rsvp(user, id, dto);
  }

  @Delete(":id/rsvp")
  cancelRsvp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.meetups.cancelRsvp(user, id);
  }

  @Post(":id/check-in")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CheckInDto) {
    return this.meetups.checkIn(user, id, dto);
  }
}

@Module({
  controllers: [MeetupsController],
  providers: [MeetupsService]
})
export class MeetupsModule {}
