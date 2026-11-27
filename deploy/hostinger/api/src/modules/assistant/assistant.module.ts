import { Body, Controller, Get, HttpException, Module, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { IntelModule } from "../intel/intel.module";
import { TrackingModule } from "../tracking/tracking.module";
import { AssistantService, type AnswerSink } from "./assistant.service";

class AskDto {
  @IsString() @Length(1, 1000) message!: string;
  @IsOptional() @IsString() @MaxLength(40) convoyId?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsBoolean() voice?: boolean;
}

class TurnDto {
  @IsIn(["user", "assistant"]) role!: "user" | "assistant";
  @IsString() @MaxLength(1000) content!: string;
}

class HelpDto {
  @IsString() @Length(1, 600) message!: string;
  @IsOptional() @IsBoolean() voice?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => TurnDto) history?: TurnDto[];
}

/**
 * Server-Sent Events over a POST response. Headers are sent lazily with the first event so
 * errors raised before streaming (auth, rate limits) still return a proper status code.
 */
async function sse(req: IncomingMessage, res: ServerResponse, run: (sink: AnswerSink, signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  let started = false;
  const sink: AnswerSink = {
    send(event, data) {
      if (controller.signal.aborted) return;
      if (!started) {
        started = true;
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no"
        });
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  try {
    await run(sink, controller.signal);
  } catch (err) {
    const status = err instanceof HttpException ? err.getStatus() : 500;
    const message = err instanceof HttpException ? err.message : "The co-pilot hit a problem. Try again.";
    if (!started) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ statusCode: status, message }));
      return;
    }
    sink.send("error", { message });
  }
  if (!res.writableEnded) res.end();
  void req;
}

@ApiTags("assistant")
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post("ask")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskDto) {
    const position = dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined;
    return this.assistant.ask(user, dto.message.trim(), dto.convoyId, position);
  }

  /** Streamed co-pilot (text or voice). Events: delta, tool, meta, done, error. */
  @Post("stream")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async stream(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskDto, @Req() req: IncomingMessage, @Res() res: ServerResponse) {
    const position = dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined;
    await sse(req, res, (sink, signal) => this.assistant.streamAsk(user, { message: dto.message.trim(), convoyId: dto.convoyId, position, voice: dto.voice }, sink, signal));
  }

  /** Public, signed-out help about KAAFILA and road safety. Strictly rate limited. */
  @Post("help/stream")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async help(@Body() dto: HelpDto, @Req() req: IncomingMessage, @Res() res: ServerResponse) {
    const clientKey = (req as IncomingMessage & { ip?: string }).ip ?? req.socket.remoteAddress ?? "unknown";
    await sse(req, res, (sink, signal) => this.assistant.streamHelp(clientKey, { message: dto.message.trim(), voice: dto.voice, history: dto.history }, sink, signal));
  }

  @Get("history")
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  history(@CurrentUser() user: AuthenticatedUser, @Query("convoyId") convoyId?: string) {
    return this.assistant.history(user, convoyId);
  }
}

@Module({
  imports: [TrackingModule, IntelModule],
  controllers: [AssistantController],
  providers: [AssistantService]
})
export class AssistantModule {}
