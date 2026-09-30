import {
  BeforeInsert,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/**
 * Tüm tabloların ortak kolonları. TypeORM'un ActiveRecord `BaseEntity`'si değildir;
 * veri erişimi repository üzerinden yapılır.
 */
export abstract class BaseEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /** id uygulamada UUIDv7 olarak üretilir; önceden atanmışsa korunur. */
  @BeforeInsert()
  ensureId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
