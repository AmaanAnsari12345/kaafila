import { Module } from "@nestjs/common";
import { ConvoysController, MapsController } from "./convoys.controller";
import { ConvoysService } from "./convoys.service";

@Module({
  controllers: [ConvoysController, MapsController],
  providers: [ConvoysService],
  exports: [ConvoysService]
})
export class ConvoysModule {}
