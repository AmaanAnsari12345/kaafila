import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards, type RawBodyRequest } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { IncomingMessage } from "node:http";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { BillingService } from "./billing.service";

class CheckoutDto {
  @IsIn(["razorpay", "stripe"]) provider!: "razorpay" | "stripe";
  @IsInt() @Min(1) @Max(200) vehicles!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) vehicleIds?: string[];
}

class SeatsDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) vehicleIds!: string[];
}

@ApiTags("billing")
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public price calculator: ₹500 per car per month. */
  @Get("quote")
  quote(@Query("vehicles", new ParseIntPipe({ optional: true })) vehicles?: number) {
    return this.billing.quote(Math.min(Math.max(vehicles ?? 1, 1), 200));
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.mine(user.id);
  }

  @Post("checkout")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.billing.checkout(user, dto);
  }

  @Post("subscriptions/:id/sandbox-activate")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  sandboxActivate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.billing.sandboxActivate(user, id);
  }

  @Post("subscriptions/:id/seats")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  assign(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SeatsDto) {
    return this.billing.assignSeats(user, id, dto.vehicleIds);
  }

  @Delete("seats/:seatId")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  unassign(@CurrentUser() user: AuthenticatedUser, @Param("seatId") seatId: string) {
    return this.billing.unassignSeat(user, seatId);
  }

  @Post("subscriptions/:id/cancel")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.billing.cancel(user, id);
  }

  @Post("webhooks/razorpay")
  @HttpCode(200)
  @SkipThrottle()
  razorpayWebhook(
    @Req() req: RawBodyRequest<IncomingMessage>,
    @Headers("x-razorpay-signature") signature?: string,
    @Headers("x-razorpay-event-id") eventId?: string
  ) {
    return this.billing.handleRazorpayWebhook(req.rawBody, signature, eventId);
  }

  @Post("webhooks/stripe")
  @HttpCode(200)
  @SkipThrottle()
  stripeWebhook(@Req() req: RawBodyRequest<IncomingMessage>, @Headers("stripe-signature") signature?: string) {
    return this.billing.handleStripeWebhook(req.rawBody, signature);
  }
}
