import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.4: `connections` (ARCHITECTURE §5.2, §9.1, §9.2). `(project_id, type)`
 * unique'tir. Faz 1'de `auth_type` her zaman `service_account`, bu yüzden
 * `credentials_encrypted` her zaman boştur (`CHK_connections_credentials_service_account_null`).
 */
export class CreateConnections1791100000000 implements MigrationInterface {
  name = 'CreateConnections1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."connection_type" AS ENUM('gsc', 'ga4')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."connection_auth_type" AS ENUM('service_account', 'oauth')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."connection_status" AS ENUM('pending', 'active', 'error', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."connection_backfill_status" AS ENUM('pending', 'running', 'done', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "connections" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "type" "public"."connection_type" NOT NULL,
        "external_id" text NOT NULL,
        "auth_type" "public"."connection_auth_type" NOT NULL DEFAULT 'service_account',
        "credentials_encrypted" text,
        "status" "public"."connection_status" NOT NULL DEFAULT 'pending',
        "last_verified_at" TIMESTAMP WITH TIME ZONE,
        "last_synced_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "backfill_status" "public"."connection_backfill_status" NOT NULL DEFAULT 'pending',
        "backfill_progress" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "CHK_connections_credentials_service_account_null" CHECK ("auth_type" <> 'service_account' OR "credentials_encrypted" IS NULL),
        CONSTRAINT "PK_0a1f844af3122354cbd487a8d03" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_connections_project_id_type" ON "connections" ("project_id", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_connections_org_id_project_id" ON "connections" ("org_id", "project_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "connections"
        ADD CONSTRAINT "FK_cadbfb25d175df3b424095f4ab3"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "connections" DROP CONSTRAINT "FK_cadbfb25d175df3b424095f4ab3"`,
    );
    await queryRunner.query(`DROP TABLE "connections"`);
    await queryRunner.query(`DROP TYPE "public"."connection_backfill_status"`);
    await queryRunner.query(`DROP TYPE "public"."connection_status"`);
    await queryRunner.query(`DROP TYPE "public"."connection_auth_type"`);
    await queryRunner.query(`DROP TYPE "public"."connection_type"`);
  }
}
