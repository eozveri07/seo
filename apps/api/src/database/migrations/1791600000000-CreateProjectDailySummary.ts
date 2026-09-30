import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.10: `project_daily_summary` (ARCHITECTURE §5.6, §10). PK
 * `(project_id, date)`; `summary` job'u proje ve tarih bazında upsert eder.
 * `visibility_score` `numeric(5,2)`, 0-100 arası (`visibility.constants.ts`).
 */
export class CreateProjectDailySummary1791600000000 implements MigrationInterface {
  name = 'CreateProjectDailySummary1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_daily_summary" (
        "date"                date                     NOT NULL,
        "project_id"          uuid                     NOT NULL,
        "org_id"              uuid                     NOT NULL,
        "gsc_clicks"          float8                   NOT NULL DEFAULT 0,
        "gsc_impressions"     float8                   NOT NULL DEFAULT 0,
        "gsc_ctr"             float8                   NOT NULL DEFAULT 0,
        "gsc_position"        float8                   NOT NULL DEFAULT 0,
        "organic_sessions"    float8                   NOT NULL DEFAULT 0,
        "organic_key_events"  float8                   NOT NULL DEFAULT 0,
        "kw_tracked"          int                      NOT NULL DEFAULT 0,
        "kw_top3"             int                      NOT NULL DEFAULT 0,
        "kw_top10"            int                      NOT NULL DEFAULT 0,
        "kw_top20"            int                      NOT NULL DEFAULT 0,
        "kw_top100"           int                      NOT NULL DEFAULT 0,
        "kw_avg_position"     float8,
        "visibility_score"    numeric(5,2)             NOT NULL DEFAULT 0,
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_daily_summary" PRIMARY KEY ("project_id", "date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_daily_summary_org_id_date" ON "project_daily_summary" ("org_id", "date")`,
    );
    await queryRunner.query(`
      ALTER TABLE "project_daily_summary"
        ADD CONSTRAINT "FK_project_daily_summary_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_daily_summary"`);
  }
}
