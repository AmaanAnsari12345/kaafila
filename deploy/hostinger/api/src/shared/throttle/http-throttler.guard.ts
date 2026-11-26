import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * The global throttler only understands HTTP requests. Socket.IO handlers apply their own
 * Redis-backed per-user limits in the gateway, so websocket contexts pass through here.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    return super.canActivate(context);
  }
}
