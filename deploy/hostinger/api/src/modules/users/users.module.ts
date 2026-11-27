import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AccountDeletionService } from "./account-deletion.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [BillingModule],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService],
  exports: [UsersService]
})
export class UsersModule {}
