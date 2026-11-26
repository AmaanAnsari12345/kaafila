import { IsDateString, IsIn, IsLatitude, IsLongitude, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateJourneyEventDto {
  @IsString()
  journeyId!: string;

  @IsIn(["trip_started", "trip_completed", "location", "stop", "photo", "video", "voice_note", "toll", "checkpoint", "hazard", "sos"])
  type!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsObject()
  metadata!: Record<string, unknown>;

  @IsDateString()
  capturedAt!: string;
}
