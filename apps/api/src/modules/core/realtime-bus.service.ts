import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Lets any module emit to Socket.IO rooms without importing the gateway (avoids circular
 * module dependencies). The gateway attaches the server in afterInit.
 */
@Injectable()
export class RealtimeBus {
  private server?: Server;
  private readonly logger = new Logger(RealtimeBus.name);

  attach(server: Server) {
    this.server = server;
  }

  static convoyRoom(convoyId: string) {
    return `convoy:${convoyId}`;
  }

  static userRoom(userId: string) {
    return `user:${userId}`;
  }

  static staffRoom() {
    return "staff";
  }

  toConvoy(convoyId: string, event: string, payload: unknown) {
    if (!this.server) return this.logger.debug(`drop ${event}: socket server not ready`);
    this.server.to(RealtimeBus.convoyRoom(convoyId)).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(RealtimeBus.userRoom(userId)).emit(event, payload);
  }

  toStaff(event: string, payload: unknown) {
    this.server?.to(RealtimeBus.staffRoom()).emit(event, payload);
  }
}
