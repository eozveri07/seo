import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.8: `keyword_groups`, `tracked_keywords` (ARCHITECTURE §5.5).
 * `tracked_keywords` unique `(project_id, keyword_normalized, device,
 * location_code, language_code)`; `keyword_normalized` uygulamada
 * (`normalizeKeyword`) lower + trim + çoklu boşluk sıkıştırmasıyla üretilir.
 */
export class CreateKeywordGroupsAndTrackedKeywords1791400000000 implements MigrationInterface {
  name = 'CreateKeywordGroupsAndTrackedKeywords1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tracked_keyword_device" AS ENUM('desktop', 'mobile')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tracked_keyword_frequency" AS ENUM('daily', 'weekly')`,
    );

    await queryRunner.query(`
      CREATE TABLE "keyword_groups" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "name" text NOT NULL,
        "color" text,
        CONSTRAINT "PK_keyword_groups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_keyword_groups_project_id_name" ON "keyword_groups" ("project_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_keyword_groups_org_id_project_id" ON "keyword_groups" ("org_id", "project_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "keyword_groups"
        ADD CONSTRAINT "FK_keyword_groups_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "tracked_keywords" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "group_id" uuid,
        "keyword" text NOT NULL,
        "keyword_normalized" text NOT NULL,
        "device" "public"."tracked_keyword_device" NOT NULL DEFAULT 'desktop',
        "location_code" integer NOT NULL,
        "language_code" text NOT NULL,
        "frequency" "public"."tracked_keyword_frequency" NOT NULL DEFAULT 'daily',
        "depth" smallint NOT NULL DEFAULT 20,
        "target_url" text,
        "tags" text[] NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        "search_volume" integer,
        "cpc" numeric(10,2),
        "volume_updated_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tracked_keywords" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tracked_keywords_project_id_normalized_device_location_language"
        ON "tracked_keywords" ("project_id", "keyword_normalized", "device", "location_code", "language_code")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_keywords_org_id_project_id" ON "tracked_keywords" ("org_id", "project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_keywords_group_id" ON "tracked_keywords" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tracked_keywords_volume_updated_at" ON "tracked_keywords" ("volume_updated_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tracked_keywords"
        ADD CONSTRAINT "FK_tracked_keywords_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "tracked_keywords"
        ADD CONSTRAINT "FK_tracked_keywords_group_id"
        FOREIGN KEY ("group_id") REFERENCES "keyword_groups"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tracked_keywords"`);
    await queryRunner.query(`DROP TABLE "keyword_groups"`);
    await queryRunner.query(`DROP TYPE "public"."tracked_keyword_frequency"`);
    await queryRunner.query(`DROP TYPE "public"."tracked_keyword_device"`);
  }
}
