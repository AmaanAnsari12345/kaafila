import { Global, Module } from "@nestjs/common";
import { MapsService } from "./maps.service";
import { PlacesService } from "./places.service";

@Global()
@Module({
  providers: [MapsService, PlacesService],
  exports: [MapsService, PlacesService]
})
export class IntegrationsModule {}
