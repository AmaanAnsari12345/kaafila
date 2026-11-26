import { IsIn, IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 80) displayName?: string;

  @IsOptional()
  @Matches(/^[a-z0-9_]{3,24}$/, { message: "Handle must be 3–24 characters: lowercase letters, numbers, underscore" })
  handle?: string;

  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) bio?: string;
  @IsOptional() @IsString() @MaxLength(80) homeCity?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(80) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
  @IsOptional() @IsIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]) bloodGroup?: string;
  @IsOptional() @IsString() @MaxLength(300) medicalNotes?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/, { message: "Enter a valid UPI ID, e.g. name@bank" })
  upiVpa?: string;
}
