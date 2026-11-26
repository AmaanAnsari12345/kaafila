import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.service";

/** Full admin access. Must run after SupabaseAuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.role !== "admin") throw new ForbiddenException("Admin access required");
    return true;
  }
}

/** Admin or support staff (read access to consoles, SOS handling, moderation). */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.role !== "admin" && request.user?.role !== "support") throw new ForbiddenException("Staff access required");
    return true;
  }
}
