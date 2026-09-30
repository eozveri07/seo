import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.2: `organizations`, `memberships`, `invitations` ve `audit_logs`
 * (ARCHITECTURE §5.1). PK ve FK adları TypeORM'un varsayılan adlandırmasıyla
 * aynıdır; `org_role` enum'u memberships ve invitations'ta ortaktır.
 *
 * - `memberships.client_id` ve `invitations.client_id`'nin FK'si T1.3'te
 *   `clients` tablosuyla eklenir. CHECK kısıtı client_viewer'da client_id'yi
 *   zorunlu, diğer rollerde boş tutar.
 * - `audit_logs` denetim izidir: `org_id` ve `user_id` bilerek FK değildir,
 *   org ya da kullanıcı silinince kayıtlar kalır.
 */
export class CreateOrganizationsAndTenancy1790900000000 implements MigrationInterface {
  name = 'CreateOrganizationsAndTenancy1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_organizations_slug" ON "organizations" ("slug")`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'analyst', 'client_viewer')`,
    );

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "public"."org_role" NOT NULL,
        "client_id" uuid,
        "invited_by" uuid,
        CONSTRAINT "CHK_memberships_client_scope" CHECK (("role" = 'client_viewer') = ("client_id" IS NOT NULL)),
        CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_memberships_org_id_user_id" ON "memberships" ("org_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_memberships_user_id" ON "memberships" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "email" text NOT NULL,
        "role" "public"."org_role" NOT NULL,
        "client_id" uuid,
        "token_hash" text NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "invited_by" uuid,
        CONSTRAINT "CHK_invitations_email_lower" CHECK ("email" = lower("email")),
        CONSTRAINT "CHK_invitations_client_scope" CHECK (("role" = 'client_viewer') = ("client_id" IS NOT NULL)),
        CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invitations_token_hash" ON "invitations" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invitations_org_id_email" ON "invitations" ("org_id", "email")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "user_id" uuid,
        "action" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" uuid,
        "changes" jsonb,
        "ip" text,
        CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_org_id_created_at" ON "audit_logs" ("org_id", "created_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "memberships"
        ADD CONSTRAINT "FK_8c6a511c72951c42e008f5537dc"
        FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "memberships"
        ADD CONSTRAINT "FK_7c1e2fdfed4f6838e0c05ae5051"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "memberships"
        ADD CONSTRAINT "FK_53f232a87d8aebb77ba3bece65a"
        FOREIGN KEY ("invited_by") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "invitations"
        ADD CONSTRAINT "FK_5267611dcc50f78999dbf54f461"
        FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "invitations"
        ADD CONSTRAINT "FK_29b1cef6891d9b9d4e35f793b81"
        FOREIGN KEY ("invited_by") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TYPE "public"."org_role"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
