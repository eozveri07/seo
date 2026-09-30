import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthSession } from '../auth.service';

/** Refresh token gövdede dönmez; httpOnly cookie olarak gönderilir. */
export class AuthResponseDto {
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  /** Access token ömrü, saniye. */
  expiresIn!: number;

  user!: UserResponseDto;

  static fromSession(session: AuthSession): AuthResponseDto {
    return {
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresIn,
      user: UserResponseDto.fromEntity(session.user),
    };
  }
}
