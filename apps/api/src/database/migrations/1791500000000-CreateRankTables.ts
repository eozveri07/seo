import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.9: `rank_tasks`, `rank_daily`, `keyword_rank_latest` (ARCHITECTURE §5.5,
 * §6). `rank_tasks` unique `(tracked_keyword_id, check_date)`: aynı keyword
 * için aynı gün tek task. `rank_daily` aylık range partition, pg_partman
 * yönetir (`gsc_daily`/`ga4_daily` gibi); PK `(date, tracked_keyword_id)`.
 *
 * `down` partman kaydını (`part_config`) ve partman'ın açtığı şablon tabloyu
 * da siler; parent'ı düşürmek partition'ları da düşürür.
 */
export class CreateRankTables1791500000000 implements MigrationInterface {
  name = 'CreateRankTables1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."rank_task_status" AS ENUM('posted', 'ready', 'fetched', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rank_source" AS ENUM('dfs_standard', 'dfs_live')`,
    );

    await queryRunner.query(`
      CREATE TABLE "rank_tasks" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "tracked_keyword_id" uuid NOT NULL,
        "check_date" date NOT NULL,
        "provider_task_id" text,
        "status" "public"."rank_task_status" NOT NULL,
        "posted_at" TIMESTAMP WITH TIME ZONE,
        "fetched_at" TIMESTAMP WITH TIME ZONE,
        "attempts" smallint NOT NULL DEFAULT 0,
        "error" text,
        CONSTRAINT "PK_rank_tasks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_rank_tasks_tracked_keyword_id_check_date"
        ON "rank_tasks" ("tracked_keyword_id", "check_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_rank_tasks_org_id_project_id_check_date"
        ON "rank_tasks" ("org_id", "project_id", "check_date")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_rank_tasks_provider_task_id" ON "rank_tasks" ("provider_task_id")`,
    );
    // rank-poll'un takılan task temizliği yalnız açık task'lara bakar.
    await queryRunner.query(`
      CREATE INDEX "IDX_rank_tasks_open_posted_at"
        ON "rank_tasks" ("posted_at")
        WHERE "status" IN ('posted', 'ready')
    `);
    await queryRunner.query(`
      ALTER TABLE "rank_tasks"
        ADD CONSTRAINT "FK_rank_tasks_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "rank_tasks"
        ADD CONSTRAINT "FK_rank_tasks_tracked_keyword_id"
        FOREIGN KEY ("tracked_keyword_id") REFERENCES "tracked_keywords"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "rank_daily" (
        "date"               date                     NOT NULL,
        "org_id"             uuid                     NOT NULL,
        "project_id"         uuid                     NOT NULL,
        "tracked_keyword_id" uuid                     NOT NULL,
        "position"           smallint,
        "rank_absolute"      smallint,
        "url"                text,
        "serp_features"      text[]                   NOT NULL DEFAULT '{}',
        "competitors_top"    jsonb                    NOT NULL DEFAULT '[]',
        "checked_at"         TIMESTAMP WITH TIME ZONE NOT NULL,
        "source"             "public"."rank_source"   NOT NULL,
        CONSTRAINT "PK_rank_daily" PRIMARY KEY ("date", "tracked_keyword_id")
      ) PARTITION BY RANGE ("date")
    `);
    // Rank verisi takip başladığında oluşur (backfill yok); 2026 başı yeterli.
    await queryRunner.query(`
      SELECT partman.create_parent(
        p_parent_table    := 'public.rank_daily',
        p_control         := 'date',
        p_interval        := '1 month',
        p_premake         := 3,
        p_start_partition := '2026-01-01'
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_rank_daily_project_id_date" ON "rank_daily" ("project_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rank_daily_tracked_keyword_id_date" ON "rank_daily" ("tracked_keyword_id", "date")`,
    );
    await queryRunner.query(`
      ALTER TABLE "rank_daily"
        ADD CONSTRAINT "FK_rank_daily_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "rank_daily"
        ADD CONSTRAINT "FK_rank_daily_tracked_keyword_id"
        FOREIGN KEY ("tracked_keyword_id") REFERENCES "tracked_keywords"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "keyword_rank_latest" (
        "tracked_keyword_id" uuid NOT NULL,
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "position" smallint,
        "url" text,
        "previous_position" smallint,
        "change_1d" smallint,
        "change_7d" smallint,
        "change_30d" smallint,
        "best_position" smallint,
        "sparkline" smallint[] NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_keyword_rank_latest" PRIMARY KEY ("tracked_keyword_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_keyword_rank_latest_org_id_project_id" ON "keyword_rank_latest" ("org_id", "project_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "keyword_rank_latest"
        ADD CONSTRAINT "FK_keyword_rank_latest_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "keyword_rank_latest"
        ADD CONSTRAINT "FK_keyword_rank_latest_tracked_keyword_id"
        FOREIGN KEY ("tracked_keyword_id") REFERENCES "tracked_keywords"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "keyword_rank_latest"`);
    await queryRunner.query(
      `DELETE FROM partman.part_config WHERE parent_table = 'public.rank_daily'`,
    );
    await queryRunner.query(`DROP TABLE "rank_daily"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS partman."template_public_rank_daily"`,
    );
    await queryRunner.query(`DROP TABLE "rank_tasks"`);
    await queryRunner.query(`DROP TYPE "public"."rank_source"`);
    await queryRunner.query(`DROP TYPE "public"."rank_task_status"`);
  }
}
