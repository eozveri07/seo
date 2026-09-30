import { Type } from 'class-transformer';
import {
  IsHexColor,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ReportBrandingDto {
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;

  /** `#1d4ed8` biçiminde. */
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;
}

export class OrganizationSettingsDto {
  /** IANA saat dilimi, ör. `Europe/Istanbul`. */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** Varsayılan dil kodu, ör. `tr`. */
  @IsOptional()
  @IsString()
  @Length(2, 10)
  defaultLanguage?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportBrandingDto)
  reportBranding?: ReportBrandingDto;
}
