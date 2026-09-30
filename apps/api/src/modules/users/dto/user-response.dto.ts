import { User } from '../user.entity';

export class UserResponseDto {
  id!: string;
  email!: string;
  name!: string;
  lastLoginAt!: Date | null;
  createdAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
