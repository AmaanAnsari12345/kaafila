import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { QUICK_SIGNALS, type QuickSignalCode } from "@kaafila/shared";

export class PointDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class NamedPointDto extends PointDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}

export class ConvoySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(10_000)
  elasticSoftMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(30_000)
  elasticHardMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(300)
  breakAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  offRouteMeters?: number;
}

export class CreateConvoyDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @ValidateNested()
  @Type(() => NamedPointDto)
  origin!: NamedPointDto;

  @ValidateNested()
  @Type(() => NamedPointDto)
  destination!: NamedPointDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  waypoints?: PointDto[];

  @IsOptional()
  @IsDateString()
  plannedDepartureAt?: string;

  @IsOptional()
  @IsIn(["private", "club", "public", "fleet", "event"])
  visibility?: "private" | "club" | "public" | "fleet" | "event";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleId?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  maxVehicles?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConvoySettingsDto)
  settings?: ConvoySettingsDto;
}

export class JoinConvoyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{4,16}$/)
  inviteCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleId?: string;

  @IsOptional()
  @IsIn(["driver", "family", "viewer"])
  role?: "driver" | "family" | "viewer";
}

export class UpdateMemberDto {
  @IsIn(["leader", "sweeper", "driver", "navigator", "family", "viewer"])
  role!: "leader" | "sweeper" | "driver" | "navigator" | "family" | "viewer";
}

export class RegroupDto extends PointDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}

export class ConvoyStatusDto {
  @IsIn(["active", "paused", "completed", "cancelled"])
  status!: "active" | "paused" | "completed" | "cancelled";
}

export class ShareLinkDto {
  @IsInt()
  @Min(1)
  @Max(72)
  hours!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

export class ChatMessageDto {
  @IsString()
  @Length(1, 500)
  body!: string;
}

export class QuickSignalDto {
  @IsIn(QUICK_SIGNALS.map((s) => s.code))
  code!: QuickSignalCode;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class SwitchVehicleDto {
  @IsString()
  @MaxLength(40)
  vehicleId!: string;
}

export class RoutePreviewDto {
  @ValidateNested()
  @Type(() => PointDto)
  origin!: PointDto;

  @ValidateNested()
  @Type(() => PointDto)
  destination!: PointDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  waypoints?: PointDto[];
}

export class GeocodeQueryDto {
  @IsString()
  @Length(3, 200)
  q!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2}(,[a-zA-Z]{2})*$/)
  countries?: string;
}

export class NearbyQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(200)
  @Max(20_000)
  radius?: number;
}
