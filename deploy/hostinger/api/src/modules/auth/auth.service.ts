import { ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { RedisService } from "../../shared/redis/redis.service";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  phone?: string;
  displayName: string;
  role: "user" | "admin" | "support";
}

const TOKEN_CACHE_SECONDS = 60;

@Injectable()
export class AuthService {
  private readonly supabase?: SupabaseClient;
  private readonly devTokensAllowed: boolean;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {
    const url = config.get<string>("SUPABASE_URL");
    const serviceRoleKey = config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    this.devTokensAllowed = config.get<string>("NODE_ENV") !== "production" && config.get<boolean>("ALLOW_DEV_TOKEN") === true;

    if (url && serviceRoleKey) {
      this.supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    }
    if (this.devTokensAllowed) {
      this.logger.warn("Development bearer tokens are ENABLED (ALLOW_DEV_TOKEN=true). Never enable this in production.");
    }
  }

  async verifyBearerToken(token?: string): Promise<AuthenticatedUser> {
    if (!token) throw new UnauthorizedException("Missing bearer token");

    const identity = await this.resolveIdentity(token);
    const user = await this.prisma.user.upsert({
      where: { id: identity.id },
      update: { lastActiveAt: new Date() },
      create: {
        id: identity.id,
        email: identity.email,
        phone: identity.phone,
        displayName: identity.displayName,
        role: identity.role
      }
    });

    if (user.deletedAt) throw new UnauthorizedException("This account was deleted");
    if (user.isSuspended) throw new ForbiddenException(`Account suspended${user.suspendedReason ? `: ${user.suspendedReason}` : ""}`);

    // Role is owned by the database once the user exists, so admins can promote/demote in the console.
    return { id: user.id, email: user.email ?? undefined, phone: user.phone ?? undefined, displayName: user.displayName, role: user.role };
  }

  /** Removes the sign-in identity (Supabase) so a deleted account can't sign in again. */
  async deleteIdentity(userId: string) {
    if (!this.supabase || userId.startsWith("usr_dev")) return;
    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) this.logger.error(`Supabase identity delete failed for ${userId}: ${error.message}`);
  }

  private async resolveIdentity(token: string): Promise<AuthenticatedUser> {
    if (this.devTokensAllowed && (token === "dev-token" || token.startsWith("dev-token:"))) {
      const suffix = token === "dev-token" ? "admin" : token.slice("dev-token:".length).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
      const isAdmin = suffix === "admin";
      return {
        id: isAdmin ? "usr_dev" : `usr_dev_${suffix}`,
        email: `${suffix}@dev.kaafila.local`,
        displayName: isAdmin ? "Dev Admin" : `Driver ${suffix}`,
        role: isAdmin ? "admin" : "user"
      };
    }

    if (!this.supabase) throw new UnauthorizedException("Authentication is not configured");

    const cacheKey = `auth:tok:${createHash("sha256").update(token).digest("hex")}`;
    const cached = await this.redis.getJson<AuthenticatedUser>(cacheKey).catch(() => null);
    if (cached) return cached;

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException("Invalid or expired token");

    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const identity: AuthenticatedUser = {
      id: data.user.id,
      email: data.user.email ?? undefined,
      phone: data.user.phone ?? undefined,
      displayName: String(meta.full_name ?? meta.name ?? data.user.email?.split("@")[0] ?? "KAAFILA Driver").slice(0, 80),
      role: "user"
    };
    await this.redis.cacheJson(cacheKey, identity, TOKEN_CACHE_SECONDS).catch(() => undefined);
    return identity;
  }
}
