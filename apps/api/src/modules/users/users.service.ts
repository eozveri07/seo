import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { normalizeEmail } from './email';
import { User } from './user.entity';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

/** Şifre hash'i dahil kullanıcı; sadece kimlik doğrulama için kullanılır. */
export type UserWithPasswordHash = User & { passwordHash: string };

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** `passwordHash` kolonu varsayılan select'te yok; burada açıkça seçilir. */
  findByEmailWithPasswordHash(
    email: string,
  ): Promise<UserWithPasswordHash | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /** `manager` verilirse çağıranın transaction'ı içinde çalışır. */
  async count(manager?: EntityManager): Promise<number> {
    return this.repository(manager).count();
  }

  async create(input: CreateUserInput, manager?: EntityManager): Promise<User> {
    const repository = this.repository(manager);
    const user = repository.create({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      isActive: true,
      lastLoginAt: null,
    });
    const saved: Partial<User> = await repository.save(user);
    // hash response'a sızmasın diye dönen nesneden atılır
    delete saved.passwordHash;
    return saved as User;
  }

  async markLoggedIn(id: string, at: Date = new Date()): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: at });
  }

  private repository(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.users;
  }
}
