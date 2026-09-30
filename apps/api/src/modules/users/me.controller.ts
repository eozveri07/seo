import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth-user';
import { InvalidAccessTokenError } from '../../common/auth/auth.errors';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  /** Oturumdaki kullanıcı. */
  @Get()
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Access token yok ya da geçersiz.' })
  async me(@CurrentUser() authUser: AuthUser): Promise<UserResponseDto> {
    const user = await this.usersService.findById(authUser.id);
    if (!user || !user.isActive) {
      // token geçerli ama kullanıcı silinmiş ya da pasifleştirilmiş
      throw new InvalidAccessTokenError();
    }
    return UserResponseDto.fromEntity(user);
  }
}
