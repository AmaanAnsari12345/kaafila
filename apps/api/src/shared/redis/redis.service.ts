import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly config: ConfigService) {
    this.client = this.create();
    this.client.on("error", (err) => this.logger.warn(`Redis error: ${err.message}`));
  }

  /** New connection with the same settings (for pub/sub, e.g. the Socket.IO adapter). */
  create(): Redis {
    return new Redis(this.config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true
    });
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  async publishJson(channel: string, payload: unknown) {
    await this.client.publish(channel, JSON.stringify(payload));
  }

  async cacheJson(key: string, payload: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async mgetJson<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const values = await this.client.mget(...keys);
    return values.map((raw) => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    });
  }

  /** Read-through cache helper. */
  async remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key).catch(() => null);
    if (cached !== null) return cached;
    const value = await producer();
    await this.cacheJson(key, value, ttlSeconds).catch(() => undefined);
    return value;
  }

  /**
   * Returns true when the caller may proceed: allows one action per `intervalMs` per key.
   * Uses SET NX PX so it is atomic across API replicas.
   */
  async throttle(key: string, intervalMs: number): Promise<boolean> {
    const result = await this.client.set(key, "1", "PX", intervalMs, "NX");
    return result === "OK";
  }

  /** Fixed-window counter. Returns true while under `limit` within `windowSeconds`. */
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, windowSeconds);
    return count <= limit;
  }

  async pushCapped(key: string, value: unknown, max: number, ttlSeconds: number) {
    await this.client.multi().lpush(key, JSON.stringify(value)).ltrim(key, 0, max - 1).expire(key, ttlSeconds).exec();
  }

  async listJson<T>(key: string, count: number): Promise<T[]> {
    const raw = await this.client.lrange(key, 0, count - 1);
    return raw.flatMap((r) => {
      try {
        return [JSON.parse(r) as T];
      } catch {
        return [];
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}
