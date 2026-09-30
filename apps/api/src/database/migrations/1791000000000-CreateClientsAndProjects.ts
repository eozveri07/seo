import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.3: `clients` ve `projects` (ARCHITECTURE §5.2). `memberships.client_id`
 * ve `invitations.client_id`'nin FK'leri de burada eklenir (T1.2'de bilerek
 * atlanmıştı, `clients` tablosu henüz yoktu).
 *
 * `projects.domain` her zaman normalize edilmiş (protokolsüz, www'siz,
 * lowercase) tutulur; bu uygulama seviyesinde zorlanır, `CHK_projects_domain_lower`
 * yalnız lowercase olmasını DB seviyesinde sabitler.
 */
export class CreateClientsAndProjects1791000000000 implements MigrationInterface {
  name = 'CreateClientsAndProjects1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "name" text NOT NULL,
        "contact_emails" text array NOT NULL DEFAULT '{}',
        "notes" text,
        "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_clients_org_id" ON "clients" ("org_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_clients_name_trgm" ON "clients" USING gin ("name" gin_trgm_ops)`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'archived')`,
    );

    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "name" text NOT NULL,
        "domain" text NOT NULL,
        "country_code" text,
        "language_code" text,
        "dfs_location_code" integer,
        "dfs_language_code" text,
        "timezone" text,
        "status" "public"."project_status" NOT NULL DEFAULT 'active',
        CONSTRAINT "CHK_projects_domain_lower" CHECK ("domain" = lower("domain")),
        CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_projects_org_id_domain" ON "projects" ("org_id", "domain")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_org_id_client_id" ON "projects" ("org_id", "client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_name_trgm" ON "projects" USING gin ("name" gin_trgm_ops)`,
    );

    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD CONSTRAINT "FK_ca29f959102228649e714827478"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "memberships"
        ADD CONSTRAINT "FK_e46119bc0fa8cf0e8987312a9cd"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "invitations"
        ADD CONSTRAINT "FK_b3ca92622941bab607e687b3e3a"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_b3ca92622941bab607e687b3e3a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_e46119bc0fa8cf0e8987312a9cd"`,
    );
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TYPE "public"."project_status"`);
    await queryRunner.query(`DROP TABLE "clients"`);
  }
}
