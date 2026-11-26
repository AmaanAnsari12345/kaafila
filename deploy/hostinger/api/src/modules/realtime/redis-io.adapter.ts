import { INestApplicationContext, Logger } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ServerOptions } from "socket.io";
import { RedisService } from "../../shared/redis/redis.service";

/**
 * Socket.IO adapter backed by Redis pub/sub so convoy rooms fan out across every API replica.
 * Run replicas behind sticky sessions (required by Socket.IO's polling transport).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
  }

  async connect(): Promise<void> {
    const redis = this.appContext.get(RedisService);
    const pub = redis.create();
    const sub = pub.duplicate();
    try {
      await Promise.all([pub.ping(), sub.ping()]);
      this.adapterConstructor = createAdapter(pub, sub);
      this.logger.log("Socket.IO Redis adapter enabled");
    } catch (err) {
      this.logger.warn(`Redis unavailable, Socket.IO runs single-instance: ${(err as Error).message}`);
      pub.disconnect();
      sub.disconnect();
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
