import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AdminAction } from "@kaafila/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(actorId: string, action: AdminAction | string, subjectType: string, subjectId: string, metadata?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: { actorId, action, subjectType, subjectId, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined }
      });
    } catch (err) {
      // Never let audit failures break the user-facing action, but make them visible.
      this.logger.error(`Audit write failed for ${action} on ${subjectType}:${subjectId}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
