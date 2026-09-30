import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** En az 8, en fazla 256 karakter. */
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}
