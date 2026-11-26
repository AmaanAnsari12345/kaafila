import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";

export function bearerFrom(header?: string | string[]): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: unknown }>();
    request.user = await this.authService.verifyBearerToken(bearerFrom(request.headers.authorization));
    return true;
  }
}
