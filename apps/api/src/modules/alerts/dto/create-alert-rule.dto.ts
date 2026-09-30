import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AlertRuleType,
  DEFAULT_COOLDOWN_HOURS,
} from '../entities/alert-rule.entity';

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEnum(AlertRuleType)
  type!: AlertRuleType;

  /** Kural tipine göre şekli değişir; `alert-rule-config.ts` doğrular. */
  @IsObject()
  config!: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  channels!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  cooldownHours?: number = DEFAULT_COOLDOWN_HOURS;
}
