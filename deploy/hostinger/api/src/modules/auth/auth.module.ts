import { Global, Module } from "@nestjs/common";
import { AdminGuard, StaffGuard } from "./admin.guard";
import { AuthService } from "./auth.service";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

@Global()
@Module({
  providers: [AuthService, SupabaseAuthGuard, AdminGuard, StaffGuard],
  exports: [AuthService, SupabaseAuthGuard, AdminGuard, StaffGuard]
})
export class AuthModule {}
