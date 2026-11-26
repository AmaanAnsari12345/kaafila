import { IsDateString, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class LocationPingDto {
  @IsString()
  @MaxLength(40)
  convoyId!: string;

  @IsString()
  @MaxLength(40)
  vehicleId!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsNumber()
  @Min(0)
  @Max(400)
  speedKph!: number;

  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000)
  accuracyMeters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @IsDateString()
  capturedAt!: string;
}
