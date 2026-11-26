import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";

@ApiTags("health")
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  /** Liveness: the process is up. */
  @Get()
  getHealth() {
    return { status: "ok", service: "kaafila-api", version: "0.2.0", timestamp: new Date().toISOString() };
  }

  /** Readiness: dependencies reachable. Use this for load balancer health checks. */
  @Get("ready")
  async ready() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping()
    ]);
    const body = { status: db && redis ? "ready" : "degraded", database: db, redis, timestamp: new Date().toISOString() };
    if (!db || !redis) throw new ServiceUnavailableException(body);
    return body;
  }
}
