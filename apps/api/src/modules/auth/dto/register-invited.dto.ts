import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Davetle kayıt: e-posta davetten alınır. */
export class RegisterInvitedDto {
  /** Davet bağlantısındaki token. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;

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
