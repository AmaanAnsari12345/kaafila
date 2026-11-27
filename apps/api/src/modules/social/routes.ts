import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Prisma } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { averageRating, buildRouteIndex, decodePolyline, ROUTE_TAGS } from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ConvoyAccessService } from "../core/convoy-access.service";

class CreateRouteDto {
  @IsString() @Length(3, 100) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** share the route a convoy you were in actually planned */
  @IsString() @MaxLength(40) convoyId!: string;
  @IsOptional() @IsString() @MaxLength(80) region?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsIn(ROUTE_TAGS as unknown as string[], { each: true }) tags?: string[];
}

class RateDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
}

class ListQuery {
  @IsOptional() @IsIn(["top", "new"]) sort?: "top" | "new";
  @IsOptional() @IsString() @MaxLength(80) region?: string;
  @IsOptional() @IsIn(ROUTE_TAGS as unknown as string[]) tag?: string;
}

const AUTHOR = { select: { id: true, displayName: true, handle: true } } as const;

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConvoyAccessService
  ) {}

  async list(userId: string, q: ListQuery) {
    const rows = await this.prisma.scenicRoute.findMany({
      where: {
        isHidden: false,
        ...(q.region ? { region: { contains: q.region, mode: "insensitive" } } : {}),
        ...(q.tag ? { tags: { has: q.tag } } : {})
      },
      orderBy: q.sort === "new" ? { createdAt: "desc" } : [{ ratingCount: "desc" }, { createdAt: "desc" }],
      take: 60,
      include: { author: AUTHOR, ratings: { where: { userId }, select: { rating: true } } }
    });
    const mapped = rows.map(({ ratings, ...r }) => ({ ...r, averageRating: averageRating(r.ratingSum, r.ratingCount), myRating: ratings[0]?.rating ?? null }));
    if (q.sort !== "new") mapped.sort((a, b) => (b.averageRating ?? 0) * Math.log2(2 + b.ratingCount) - (a.averageRating ?? 0) * Math.log2(2 + a.ratingCount));
    return mapped;
  }

  async get(userId: string, id: string) {
    const r = await this.prisma.scenicRoute.findUnique({ where: { id }, include: { author: AUTHOR, ratings: { where: { userId }, select: { rating: true } } } });
    if (!r || r.isHidden) throw new NotFoundException("Route not found");
    const { ratings, ...rest } = r;
    return { ...rest, averageRating: averageRating(r.ratingSum, r.ratingCount), myRating: ratings[0]?.rating ?? null };
  }

  async create(user: AuthenticatedUser, dto: CreateRouteDto) {
    await this.access.requireMember(dto.convoyId, user);
    const c = await this.prisma.convoy.findUnique({ where: { id: dto.convoyId } });
    if (!c?.routePolyline) throw new BadRequestException("That convoy has no planned route to share");
    const pts = decodePolyline(c.routePolyline);
    if (pts.length < 3) throw new BadRequestException("Only road-routed convoys can be shared (this one used a straight-line estimate)");
    return this.prisma.scenicRoute.create({
      data: {
        authorId: user.id,
        title: dto.title,
        description: dto.description,
        polyline: c.routePolyline,
        distanceM: c.routeDistanceM ?? Math.round(buildRouteIndex(pts).totalMeters),
        startName: c.originName,
        endName: c.destinationName,
        startLat: c.originLat,
        startLng: c.originLng,
        endLat: c.destinationLat,
        endLng: c.destinationLng,
        region: dto.region,
        tags: dto.tags ?? []
      }
    });
  }

  async rate(user: AuthenticatedUser, id: string, rating: number) {
    return this.prisma.$transaction(async (tx) => {
      const route = await tx.scenicRoute.findUnique({ where: { id } });
      if (!route || route.isHidden) throw new NotFoundException("Route not found");
      const existing = await tx.routeRating.findUnique({ where: { routeId_userId: { routeId: id, userId: user.id } } });
      if (existing) {
        await tx.routeRating.update({ where: { id: existing.id }, data: { rating } });
        await tx.scenicRoute.update({ where: { id }, data: { ratingSum: { increment: rating - existing.rating } } });
      } else {
        await tx.routeRating.create({ data: { routeId: id, userId: user.id, rating } });
        await tx.scenicRoute.update({ where: { id }, data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } } });
      }
      const updated = await tx.scenicRoute.findUniqueOrThrow({ where: { id } });
      return { averageRating: averageRating(updated.ratingSum, updated.ratingCount), ratingCount: updated.ratingCount, myRating: rating };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const route = await this.prisma.scenicRoute.findUnique({ where: { id } });
    if (!route) throw new NotFoundException("Route not found");
    if (route.authorId !== user.id && user.role === "user") throw new ForbiddenException("Not your route");
    await this.prisma.scenicRoute.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags("social")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("social/routes")
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListQuery) {
    return this.routes.list(user.id, q);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.routes.get(user.id, id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRouteDto) {
    return this.routes.create(user, dto);
  }

  @Post(":id/rate")
  rate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RateDto) {
    return this.routes.rate(user, id, dto.rating);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.routes.remove(user, id);
  }
}
