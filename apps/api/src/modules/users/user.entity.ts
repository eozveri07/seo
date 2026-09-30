import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

/**
 * Tenant verisi değildir; bir kullanıcı birden fazla organizasyona üye olabilir.
 * `email` her zaman küçük harfle yazılır (CHECK kısıtı) ve unique'tir; böylece
 * tekillik büyük/küçük harften bağımsızdır.
 */
@Entity('users')
@Check('CHK_users_email_lower', `"email" = lower("email")`)
export class User extends BaseEntity {
  @Index('UQ_users_email', { unique: true })
  @Column('text')
  email!: string;

  /** argon2id hash'i. Loglanmaz, response'a konmaz. */
  @Column('text', { select: false })
  passwordHash!: string;

  @Column('text')
  name!: string;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('timestamptz', { nullable: true })
  lastLoginAt!: Date | null;
}
