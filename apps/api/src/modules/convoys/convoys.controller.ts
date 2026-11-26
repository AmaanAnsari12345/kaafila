import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RedisService } from "../../shared/redis/redis.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { MapsService } from "../integrations/maps.service";
import { ConvoysService } from "./convoys.service";
import {
  ChatMessageDto,
  ConvoyStatusDto,
  CreateConvoyDto,
  GeocodeQueryDto,
  JoinConvoyDto,
  QuickSignalDto,
  RegroupDto,
  RoutePreviewDto,
  ShareLinkDto,
  UpdateMemberDto
} from "./dto/convoy.dto";

@ApiTags("convoys")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("convoys")
export class ConvoysController {
  constructor(private readonly convoys: ConvoysService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConvoyDto) {
    return this.convoys.create(user, dto);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.convoys.listMine(user.id);
  }

  @Get("invite/:code")
  preview(@Param("code") code: string) {
    return this.convoys.previewByCode(code);
  }

  @Post("join")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinConvoyDto) {
    return this.convoys.join(user, dto);
  }

  @Get(":id")
  getById(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.convoys.getById(user, id);
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ConvoyStatusDto) {
    return this.convoys.setStatus(user, id, dto);
  }

  @Patch(":id/members/:userId")
  updateMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("userId") userId: string, @Body() dto: UpdateMemberDto) {
    return this.convoys.updateMember(user, id, userId, dto);
  }

  @Delete(":id/members/:userId")
  removeMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("userId") userId: string) {
    return this.convoys.removeMember(user, id, userId);
  }

  @Post(":id/regroup")
  setRegroup(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RegroupDto) {
    return this.convoys.setRegroup(user, id, dto);
  }

  @Delete(":id/regroup")
  clearRegroup(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.convoys.clearRegroup(user, id);
  }

  @Get(":id/messages")
  messages(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.convoys.messages(user, id);
  }

  @Post(":id/messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  postMessage(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ChatMessageDto) {
    return this.convoys.postMessage(user, id, dto);
  }

  @Post(":id/signals")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  signal(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: QuickSignalDto) {
    return this.convoys.sendSignal(user, id, dto);
  }

  @Post(":id/alerts/:alertId/ack")
  ack(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("alertId") alertId: string) {
    return this.convoys.acknowledgeAlert(user, id, alertId);
  }

  @Post(":id/share-links")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createShareLink(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ShareLinkDto) {
    return this.convoys.createShareLink(user, id, dto);
  }

  @Get(":id/share-links")
  listShareLinks(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.convoys.listShareLinks(user, id);
  }

  @Delete(":id/share-links/:linkId")
  revokeShareLink(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("linkId") linkId: string) {
    return this.convoys.revokeShareLink(user, id, linkId);
  }
}

@ApiTags("maps")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("maps")
export class MapsController {
  constructor(
    private readonly maps: MapsService,
    private readonly redis: RedisService
  ) {}

  @Get("geocode")
  async geocode(@CurrentUser() user: AuthenticatedUser, @Query() query: GeocodeQueryDto) {
    if (!(await this.redis.allow(`rl:geocode:${user.id}`, 20, 60))) throw new HttpException("Too many searches, slow down", HttpStatus.TOO_MANY_REQUESTS);
    return this.maps.geocode(query.q, query.countries);
  }

  @Post("route")
  async route(@CurrentUser() user: AuthenticatedUser, @Body() dto: RoutePreviewDto) {
    if (!(await this.redis.allow(`rl:route:${user.id}`, 30, 60))) throw new HttpException("Too many route requests, slow down", HttpStatus.TOO_MANY_REQUESTS);
    return this.maps.planRoute(dto.origin, dto.destination, dto.waypoints ?? []);
  }
}
