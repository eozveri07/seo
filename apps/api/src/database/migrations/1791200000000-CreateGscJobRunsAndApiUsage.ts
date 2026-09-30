import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.5: GSC tabloları (ARCHITECTURE §5.3, §6), `job_runs` ve `api_usage`
 * (§5.6).
 *
 * - `gsc_site_daily` küçük tablo, partition'sız.
 * - `gsc_page_daily` ve `gsc_daily` aylık range partition; partition'ları
 *   pg_partman yönetir (`partman.create_parent`, bakım housekeeping'de).
 *   Parent'ta açılan index'ler mevcut ve sonradan oluşan partition'lara
 *   otomatik uygulanır.
 * - Hash kolonları `md5(text)` (char(32)); uzun metin PK'ya girmez.
 *
 * `down` partman kaydını (`part_config`) ve partman'ın açtığı şablon
 * tabloyu da siler; parent'ı düşürmek partition'ları da düşürür.
 */
export class CreateGscJobRunsAndApiUsage1791200000000 implements MigrationInterface {
  name = 'CreateGscJobRunsAndApiUsage1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gsc_site_daily" (
        "date"        date        NOT NULL,
        "org_id"      uuid        NOT NULL,
        "project_id"  uuid        NOT NULL,
        "clicks"      integer     NOT NULL,
        "impressions" integer     NOT NULL,
        "ctr"         real        NOT NULL,
        "position"    real        NOT NULL,
        CONSTRAINT "PK_gsc_site_daily" PRIMARY KEY ("project_id", "date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_site_daily_org_id_project_id" ON "gsc_site_daily" ("org_id", "project_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "gsc_site_daily"
        ADD CONSTRAINT "FK_gsc_site_daily_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "gsc_page_daily" (
        "date"        date        NOT NULL,
        "org_id"      uuid        NOT NULL,
        "project_id"  uuid        NOT NULL,
        "page"        text        NOT NULL,
        "page_hash"   char(32)    NOT NULL,
        "device"      varchar(10) NOT NULL,
        "country"     varchar(3)  NOT NULL,
        "clicks"      integer     NOT NULL,
        "impressions" integer     NOT NULL,
        "ctr"         real        NOT NULL,
        "position"    real        NOT NULL,
        CONSTRAINT "PK_gsc_page_daily" PRIMARY KEY ("date", "project_id", "page_hash", "device", "country")
      ) PARTITION BY RANGE ("date")
    `);
    await this.createMonthlyPartitions(queryRunner, 'gsc_page_daily');
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_page_daily_project_id_date" ON "gsc_page_daily" ("project_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_page_daily_project_id_page_hash_date" ON "gsc_page_daily" ("project_id", "page_hash", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_page_daily_page_trgm" ON "gsc_page_daily" USING gin ("page" gin_trgm_ops)`,
    );
    await queryRunner.query(`
      ALTER TABLE "gsc_page_daily"
        ADD CONSTRAINT "FK_gsc_page_daily_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "gsc_daily" (
        "date"        date        NOT NULL,
        "org_id"      uuid        NOT NULL,
        "project_id"  uuid        NOT NULL,
        "query"       text        NOT NULL,
        "query_hash"  char(32)    NOT NULL,
        "page"        text        NOT NULL,
        "page_hash"   char(32)    NOT NULL,
        "country"     varchar(3)  NOT NULL,
        "device"      varchar(10) NOT NULL,
        "clicks"      integer     NOT NULL,
        "impressions" integer     NOT NULL,
        "ctr"         real        NOT NULL,
        "position"    real        NOT NULL,
        CONSTRAINT "PK_gsc_daily" PRIMARY KEY ("date", "project_id", "query_hash", "page_hash", "country", "device")
      ) PARTITION BY RANGE ("date")
    `);
    await this.createMonthlyPartitions(queryRunner, 'gsc_daily');
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_daily_project_id_date" ON "gsc_daily" ("project_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_daily_project_id_query_hash_date" ON "gsc_daily" ("project_id", "query_hash", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_daily_project_id_page_hash_date" ON "gsc_daily" ("project_id", "page_hash", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gsc_daily_query_trgm" ON "gsc_daily" USING gin ("query" gin_trgm_ops)`,
    );
    await queryRunner.query(`
      ALTER TABLE "gsc_daily"
        ADD CONSTRAINT "FK_gsc_daily_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE TYPE "public"."job_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_run_trigger" AS ENUM('schedule', 'manual', 'system')`,
    );
    await queryRunner.query(`
      CREATE TABLE "job_runs" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid,
        "type" character varying(50) NOT NULL,
        "status" "public"."job_run_status" NOT NULL DEFAULT 'queued',
        "trigger" "public"."job_run_trigger" NOT NULL,
        "bullmq_job_id" text,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "stats" jsonb,
        "error" text,
        CONSTRAINT "PK_job_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_job_runs_org_id_project_id_created_at" ON "job_runs" ("org_id", "project_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_runs_status_started_at" ON "job_runs" ("status", "started_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "job_runs"
        ADD CONSTRAINT "FK_job_runs_org_id"
        FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "job_runs"
        ADD CONSTRAINT "FK_job_runs_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE TYPE "public"."api_usage_provider" AS ENUM('dataforseo', 'gsc', 'ga4', 'anthropic')`,
    );
    // Maliyet kaydı olduğu için org/proje silinince de kalır (FK yok);
    // job_runs 90 günde temizlendiğinde bağ kopar (SET NULL).
    await queryRunner.query(`
      CREATE TABLE "api_usage" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid,
        "project_id" uuid,
        "provider" "public"."api_usage_provider" NOT NULL,
        "endpoint" text NOT NULL,
        "units" integer NOT NULL DEFAULT 1,
        "cost" numeric(12,6) NOT NULL DEFAULT 0,
        "job_run_id" uuid,
        CONSTRAINT "PK_api_usage" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_api_usage_org_id_created_at" ON "api_usage" ("org_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_api_usage_provider_created_at" ON "api_usage" ("provider", "created_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "api_usage"
        ADD CONSTRAINT "FK_api_usage_job_run_id"
        FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_usage"`);
    await queryRunner.query(`DROP TYPE "public"."api_usage_provider"`);

    await queryRunner.query(`DROP TABLE "job_runs"`);
    await queryRunner.query(`DROP TYPE "public"."job_run_trigger"`);
    await queryRunner.query(`DROP TYPE "public"."job_run_status"`);

    await this.dropPartitionedTable(queryRunner, 'gsc_daily');
    await this.dropPartitionedTable(queryRunner, 'gsc_page_daily');
    await queryRunner.query(`DROP TABLE "gsc_site_daily"`);
  }

  /**
   * ARCHITECTURE §6. `p_start_partition`: GSC geçmişi 16 ay geriye gider,
   * backfill'in yazacağı en eski ay için partition hazır olmalı.
   */
  private async createMonthlyPartitions(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await queryRunner.query(`
      SELECT partman.create_parent(
        p_parent_table    := 'public.${table}',
        p_control         := 'date',
        p_interval        := '1 month',
        p_premake         := 3,
        p_start_partition := '2024-01-01'
      )
    `);
  }

  private async dropPartitionedTable(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    await queryRunner.query(
      `DELETE FROM partman.part_config WHERE parent_table = 'public.${table}'`,
    );
    await queryRunner.query(`DROP TABLE "${table}"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS partman."template_public_${table}"`,
    );
  }
}
