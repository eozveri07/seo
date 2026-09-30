import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateKeywordGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
