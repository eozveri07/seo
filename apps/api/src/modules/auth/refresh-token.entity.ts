import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { User } from '../users/user.entity';

/**
 * Opak refresh token'ın DB kaydı (ARCHITECTURE §4.4). Token'ın kendisi değil
 * SHA-256 hash'i tutulur. Aynı login'den türeyen token'lar bir `familyId`
 * paylaşır; kullanılan token `replacedById` ile yenisine bağlanır.
 *
 * Tenant verisi değildir. İlişkiler sadece FK kısıtları için tanımlıdır;
 * yüklenmez, veri `userId` / `replacedById` üzerinden okunur.
 */
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_id', ['userId'])
@Index('IDX_refresh_tokens_family_id', ['familyId'])
@Index('IDX_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken extends BaseEntity {
  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column('uuid')
  familyId!: string;

  /** Token'ın SHA-256 hash'i (hex). Loglanmaz, response'a konmaz. */
  @Index('UQ_refresh_tokens_token_hash', { unique: true })
  @Column('text', { select: false })
  tokenHash!: string;

  @Column('timestamptz')
  expiresAt!: Date;

  @Column('timestamptz', { nullable: true })
  revokedAt!: Date | null;

  @Column('uuid', { nullable: true })
  replacedById!: string | null;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy?: RefreshToken | null;

  @Column('text', { nullable: true })
  userAgent!: string | null;

  @Column('text', { nullable: true })
  ip!: string | null;
}
