import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { DOCUMENT_KINDS, REMINDER_TYPES } from "@kaafila/shared";

export class CreateVehicleDto {
  @IsIn(["car", "suv", "supercar", "motorcycle", "bus", "truck", "ev", "support"])
  type!: "car" | "suv" | "supercar" | "motorcycle" | "bus" | "truck" | "ev" | "support";

  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional() @IsString() @MaxLength(40) make?: string;
  @IsOptional() @IsString() @MaxLength(40) model?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @IsString() @MaxLength(16) @Matches(/^[A-Za-z0-9 -]+$/) plateNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
  @IsOptional() @IsIn(["petrol", "diesel", "cng", "lpg", "ev", "hybrid"]) fuelType?: "petrol" | "diesel" | "cng" | "lpg" | "ev" | "hybrid";
  @IsOptional() @IsInt() @Min(20) @Max(3000) rangeKmFull?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsBoolean() isShowcase?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

export class MaintenanceDto {
  @IsString() @Length(1, 40) type!: string;
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) costMinor?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsDateString() performedAt!: string;
  /** when set, the reminder with this id is rolled forward by its interval */
  @IsOptional() @IsString() @MaxLength(40) reminderId?: string;
}

export class ReminderDto {
  @IsIn(REMINDER_TYPES.map((r) => r.id)) type!: string;
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) dueOdometerKm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  @IsOptional() @IsInt() @Min(100) @Max(200_000) intervalKm?: number;
}

export class DocumentDto {
  @IsIn(DOCUMENT_KINDS.map((d) => d.id)) kind!: string;
  @IsOptional() @IsString() @MaxLength(60) number?: string;
  @IsOptional() @IsString() @MaxLength(80) issuer?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(500) fileUrl?: string;
}

export class TelemetryDto {
  @IsObject() readings!: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[PCBU][0-3][0-9A-F]{3}$/, { each: true })
  dtcs?: string[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5_000_000) odometerKm?: number;
}
