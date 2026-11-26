import { HttpException, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { IsString, MaxLength, validate } from "class-validator";
import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS, type VoiceSignalPayload } from "@kaafila/shared";
import { RedisService } from "../../shared/redis/redis.service";
import { AuthService, type AuthenticatedUser } from "../auth/auth.service";
import { bearerFrom } from "../auth/supabase-auth.guard";
import { ConvoyAccessService } from "../core/convoy-access.service";
import { RealtimeBus } from "../core/realtime-bus.service";
import { ConvoysService } from "../convoys/convoys.service";
import { ChatMessageDto, QuickSignalDto, RegroupDto } from "../convoys/dto/convoy.dto";
import { RaiseSosDto } from "../safety/safety.module";
import { SafetyService } from "../safety/safety.service";
import { LocationPingDto } from "../tracking/dto/location-ping.dto";
import { TrackingService } from "../tracking/tracking.service";

class ConvoyRef {
  @IsString()
  @MaxLength(40)
  convoyId!: string;
}

class ChatPayload extends ChatMessageDto {
  @IsString()
  @MaxLength(40)
  convoyId!: string;
}

class SignalPayload extends QuickSignalDto {
  @IsString()
  @MaxLength(40)
  convoyId!: string;
}

class RegroupPayload extends RegroupDto {
  @IsString()
  @MaxLength(40)
  convoyId!: string;
}

type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; status?: number };

interface SocketData {
  user: AuthenticatedUser;
}

const allowedOrigins = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").split(",").map((o) => o.trim());

@WebSocketGateway({
  cors: { origin: allowedOrigins, credentials: true },
  transports: ["websocket", "polling"],
  pingInterval: 20_000,
  pingTimeout: 25_000
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly access: ConvoyAccessService,
    private readonly bus: RealtimeBus,
    private readonly redis: RedisService,
    private readonly tracking: TrackingService,
    private readonly convoys: ConvoysService,
    private readonly safety: SafetyService
  ) {}

  afterInit(server: Server) {
    this.bus.attach(server);
    // Authenticate during the handshake; unauthenticated sockets never connect.
    server.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth?.token as string | undefined) ?? bearerFrom(socket.handshake.headers.authorization);
        const user = await this.auth.verifyBearerToken(token);
        (socket.data as SocketData).user = user;
        next();
      } catch (err) {
        next(new Error(err instanceof HttpException ? err.message : "unauthorized"));
      }
    });
  }

  async handleConnection(socket: Socket) {
    const user = this.userOf(socket);
    if (!user) return socket.disconnect(true);
    await socket.join(RealtimeBus.userRoom(user.id));
    if (user.role === "admin" || user.role === "support") await socket.join(RealtimeBus.staffRoom());
    this.logger.debug(`socket ${socket.id} connected as ${user.id}`);
  }

  handleDisconnect(socket: Socket) {
    const user = this.userOf(socket);
    if (!user) return;
    for (const room of socket.rooms) {
      if (room.startsWith("convoy:")) this.server.to(room).emit(SOCKET_EVENTS.presence, { type: "offline", userId: user.id });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.join)
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, ConvoyRef, body, async (user, dto) => {
      await this.access.requireMember(dto.convoyId, user, { allowStaff: true });
      await socket.join(RealtimeBus.convoyRoom(dto.convoyId));
      socket.to(RealtimeBus.convoyRoom(dto.convoyId)).emit(SOCKET_EVENTS.presence, { type: "online", userId: user.id, displayName: user.displayName });
      return this.tracking.snapshot(user, dto.convoyId);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.leave)
  leave(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, ConvoyRef, body, async (_user, dto) => {
      await socket.leave(RealtimeBus.convoyRoom(dto.convoyId));
      return { left: dto.convoyId };
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.locationPing)
  locationPing(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, LocationPingDto, body, (user, dto) => this.tracking.ingest(user, dto));
  }

  @SubscribeMessage(SOCKET_EVENTS.signal)
  signal(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, SignalPayload, body, async (user, dto) => {
      await this.rateLimit(`ws:sig:${user.id}`, 20, 60);
      return this.convoys.sendSignal(user, dto.convoyId, dto);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.chat)
  chat(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, ChatPayload, body, async (user, dto) => {
      await this.rateLimit(`ws:chat:${user.id}`, 30, 60);
      return this.convoys.postMessage(user, dto.convoyId, dto);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.regroup)
  regroup(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, RegroupPayload, body, (user, dto) => this.convoys.setRegroup(user, dto.convoyId, dto));
  }

  @SubscribeMessage(SOCKET_EVENTS.sos)
  sos(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, RaiseSosDto, body, async (user, dto) => {
      await this.rateLimit(`ws:sos:${user.id}`, 10, 60);
      return this.safety.raise(user, dto);
    });
  }

  /** Push-to-talk / WebRTC signalling relay. The sender identity always comes from the socket. */
  @SubscribeMessage(SOCKET_EVENTS.voice)
  async voice(@ConnectedSocket() socket: Socket, @MessageBody() body: Partial<VoiceSignalPayload>): Promise<Ack> {
    const user = this.userOf(socket);
    if (!user || typeof body?.convoyId !== "string" || typeof body.channelId !== "string") return { ok: false, error: "invalid payload" };
    try {
      await this.access.requireMember(body.convoyId, user);
      await this.rateLimit(`ws:voice:${user.id}`, 120, 60);
      const kind = ["ptt_start", "ptt_stop", "speaking", "muted", "signal"].includes(String(body.kind)) ? body.kind! : "signal";
      socket.to(RealtimeBus.convoyRoom(body.convoyId)).emit(SOCKET_EVENTS.voice, {
        convoyId: body.convoyId,
        channelId: body.channelId.slice(0, 40),
        userId: user.id,
        displayName: user.displayName,
        kind,
        data: body.data && typeof body.data === "object" ? body.data : undefined
      });
      return { ok: true };
    } catch (err) {
      return this.toAck(err);
    }
  }

  /* ------------------------------------------------------------------------ */

  private userOf(socket: Socket): AuthenticatedUser | undefined {
    return (socket.data as SocketData | undefined)?.user;
  }

  private async rateLimit(key: string, limit: number, windowSeconds: number) {
    if (!(await this.redis.allow(key, limit, windowSeconds))) throw new HttpException("Slow down", 429);
  }

  private async handle<T extends object, R>(socket: Socket, cls: ClassConstructor<T>, body: unknown, fn: (user: AuthenticatedUser, dto: T) => Promise<R>): Promise<Ack<R>> {
    const user = this.userOf(socket);
    if (!user) return { ok: false, error: "unauthorized", status: 401 };
    const dto = plainToInstance(cls, body ?? {});
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length) {
      const message = errors.flatMap((e) => Object.values(e.constraints ?? {})).join("; ");
      return { ok: false, error: message || "invalid payload", status: 400 };
    }
    try {
      return { ok: true, data: await fn(user, dto) };
    } catch (err) {
      return this.toAck(err);
    }
  }

  private toAck(err: unknown): Ack<never> {
    if (err instanceof HttpException) return { ok: false, error: err.message, status: err.getStatus() };
    this.logger.error(`socket handler failed: ${(err as Error).message}`);
    return { ok: false, error: "internal error", status: 500 };
  }
}
