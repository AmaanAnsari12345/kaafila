import { Body, Controller, Get, HttpException, HttpStatus, Injectable, Module, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import {
  emergencyNumbersFor,
  geohashEncode,
  guideById,
  POI_CATEGORIES,
  pointAtChainage,
  ROAD_REPORT_TYPES,
  ROADSIDE_GUIDES,
  type PoiCategory,
  type RoadReportType
} from "@kaafila/shared";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { MapsService } from "../integrations/maps.service";
import { PlacesService } from "../integrations/places.service";
import { IntelModule } from "../intel/intel.module";
import { IntelService } from "../intel/intel.service";
import { TrackingModule } from "../tracking/tracking.module";
import { TrackingService } from "../tracking/tracking.service";

class LatLngQuery {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

class EmergencyQuery {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

class NearbyQuery extends LatLngQuery {
  @IsIn(POI_CATEGORIES.map((c) => c.id))
  category!: PoiCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(500)
  @Max(20_000)
  radius?: number;
}

class RoadReportDto {
  @IsIn(ROAD_REPORT_TYPES.map((t) => t.id))
  type!: RoadReportType;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  convoyId?: string;
}

class VoteDto {
  @IsBoolean()
  stillThere!: boolean;
}

@Injectable()
export class RoadReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async near(lat: number, lng: number) {
    const d = 0.15; // ~15 km box
    return this.prisma.roadReport.findMany({
      where: { isRemoved: false, expiresAt: { gt: new Date() }, lat: { gte: lat - d, lte: lat + d }, lng: { gte: lng - d, lte: lng + d } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, lat: true, lng: true, note: true, confirmations: true, dismissals: true, expiresAt: true, createdAt: true }
    });
  }

  async create(user: AuthenticatedUser, dto: RoadReportDto) {
    const ttl = ROAD_REPORT_TYPES.find((t) => t.id === dto.type)!.ttlMinutes;
    // Merge with an identical report within ~150 m instead of duplicating.
    const nearby = await this.prisma.roadReport.findFirst({
      where: {
        type: dto.type,
        isRemoved: false,
        expiresAt: { gt: new Date() },
        lat: { gte: dto.lat - 0.0015, lte: dto.lat + 0.0015 },
        lng: { gte: dto.lng - 0.0015, lte: dto.lng + 0.0015 }
      }
    });
    if (nearby) return this.vote(user, nearby.id, true);
    return this.prisma.roadReport.create({
      data: {
        reporterId: user.id,
        convoyId: dto.convoyId,
        type: dto.type,
        lat: dto.lat,
        lng: dto.lng,
        geohash5: geohashEncode({ lat: dto.lat, lng: dto.lng }, 5),
        note: dto.note,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        votes: { create: { userId: user.id, stillThere: true } }
      }
    });
  }

  async vote(user: AuthenticatedUser, reportId: string, stillThere: boolean) {
    const report = await this.prisma.roadReport.findUnique({ where: { id: reportId } });
    if (!report || report.isRemoved) throw new NotFoundException("Report not found");
    const existing = await this.prisma.roadReportVote.findUnique({ where: { reportId_userId: { reportId, userId: user.id } } });
    if (existing) return report;
    const ttl = ROAD_REPORT_TYPES.find((t) => t.id === report.type)!.ttlMinutes;
    const confirmations = report.confirmations + (stillThere ? 1 : 0);
    const dismissals = report.dismissals + (stillThere ? 0 : 1);
    const expired = dismissals >= 3 && dismissals > confirmations;
    const [, updated] = await this.prisma.$transaction([
      this.prisma.roadReportVote.create({ data: { reportId, userId: user.id, stillThere } }),
      this.prisma.roadReport.update({
        where: { id: reportId },
        data: {
          confirmations,
          dismissals,
          expiresAt: expired ? new Date() : stillThere ? new Date(Math.max(report.expiresAt.getTime(), Date.now() + (ttl * 60_000) / 2)) : report.expiresAt
        }
      })
    ]);
    return updated;
  }
}

@ApiTags("roadside")
@Controller("roadside")
export class RoadsidePublicController {
  constructor(private readonly maps: MapsService) {}

  /** Public: emergency numbers must work even when signed out. */
  @Get("emergency")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async emergency(@Query() q: EmergencyQuery) {
    let country = q.country?.toUpperCase() ?? null;
    if (!country && q.lat !== undefined && q.lng !== undefined) country = await this.maps.reverseCountry({ lat: q.lat, lng: q.lng });
    return { ...emergencyNumbersFor(country), disclaimer: "Numbers can change and vary by region. Verify locally; when in doubt call 112 from a mobile phone." };
  }

  @Get("guides")
  guides() {
    return ROADSIDE_GUIDES;
  }

  @Get("guides/:id")
  guide(@Param("id") id: string) {
    const g = guideById(id);
    if (!g) throw new NotFoundException("Guide not found");
    return g;
  }
}

@ApiTags("roadside")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("roadside")
export class RoadsideController {
  constructor(
    private readonly places: PlacesService,
    private readonly reports: RoadReportsService,
    private readonly redis: RedisService,
    private readonly access: ConvoyAccessService,
    private readonly tracking: TrackingService,
    private readonly intel: IntelService
  ) {}

  @Get("nearby")
  async nearby(@CurrentUser() user: AuthenticatedUser, @Query() q: NearbyQuery) {
    if (!(await this.redis.allow(`rl:poi:${user.id}`, 30, 60))) throw new HttpException("Too many searches, slow down", HttpStatus.TOO_MANY_REQUESTS);
    try {
      return await this.places.nearby(q.category, { lat: q.lat, lng: q.lng }, q.radius ?? 8000);
    } catch (err) {
      throw new HttpException(`Places lookup unavailable: ${(err as Error).message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Get("weather")
  async weather(@Query() q: LatLngQuery) {
    try {
      return await this.places.weatherAt([{ lat: q.lat, lng: q.lng }]);
    } catch (err) {
      throw new HttpException(`Weather unavailable: ${(err as Error).message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Weather at the lead car and at 15, 40, 80 and 150 km further along the route. */
  @Get("weather/convoys/:convoyId")
  async routeWeather(@CurrentUser() user: AuthenticatedUser, @Param("convoyId") convoyId: string) {
    await this.access.requireMember(convoyId, user, { allowStaff: true });
    const meta = await this.tracking.convoyMeta(convoyId);
    const { route } = this.intel.routeFor(meta);
    const report = await this.intel.forConvoy(user, convoyId);
    const lead = report.formation.entries.find((e) => e.vehicleId === report.formation.leadVehicleId)?.chainageMeters ?? 0;
    const offsets = [0, 15_000, 40_000, 80_000, 150_000].filter((o) => lead + o <= route.totalMeters + 1);
    const points = offsets.map((o) => pointAtChainage(route, lead + o));
    try {
      const wx = await this.places.weatherAt(points);
      return wx.map((w, i) => ({ ...w, distanceAheadMeters: offsets[i] }));
    } catch (err) {
      throw new HttpException(`Weather unavailable: ${(err as Error).message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Get("reports")
  near(@Query() q: LatLngQuery) {
    return this.reports.near(q.lat, q.lng);
  }

  @Post("reports")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: AuthenticatedUser, @Body() dto: RoadReportDto) {
    return this.reports.create(user, dto);
  }

  @Post("reports/:id/vote")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  vote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: VoteDto) {
    return this.reports.vote(user, id, dto.stillThere);
  }
}

@Module({
  imports: [TrackingModule, IntelModule],
  controllers: [RoadsidePublicController, RoadsideController],
  providers: [RoadReportsService]
})
export class RoadsideModule {}
