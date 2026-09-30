import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.15: `reports` ve `report_schedules` (ARCHITECTURE §5.7, §12).
 * `reports.status`: queued -> rendering -> ready|failed; `report` processor'ı
 * günceller. `report_schedules.cron`/`timezone` `report-dispatch` Job
 * Scheduler'ının zamanı gelen schedule'ları bulmasında kullanılır.
 */
export class CreateReportsAndSchedules1791800000000 implements MigrationInterface {
  name = 'CreateReportsAndSchedules1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."report_type" AS ENUM('weekly', 'monthly', 'custom')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."report_status" AS ENUM('queued', 'rendering', 'ready', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "reports" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "type" "public"."report_type" NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "status" "public"."report_status" NOT NULL DEFAULT 'queued',
        "file_key" text,
        "file_size" integer,
        "generated_at" TIMESTAMP WITH TIME ZONE,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "sent_to" text[] NOT NULL DEFAULT '{}',
        "error" text,
        "analyst_note" text,
        "created_by" uuid,
        CONSTRAINT "PK_reports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reports_org_id_project_id_period_start" ON "reports" ("org_id", "project_id", "period_start")`,
    );
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD CONSTRAINT "FK_reports_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "report_schedules" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "type" "public"."report_type" NOT NULL,
        "cron" text NOT NULL,
        "timezone" text NOT NULL,
        "recipients" text[] NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_report_schedules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_report_schedules_org_id_project_id" ON "report_schedules" ("org_id", "project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_report_schedules_is_active" ON "report_schedules" ("is_active")`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_schedules"
        ADD CONSTRAINT "FK_report_schedules_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "report_schedules" DROP CONSTRAINT "FK_report_schedules_project_id"`,
    );
    await queryRunner.query(`DROP TABLE "report_schedules"`);
    await queryRunner.query(
      `ALTER TABLE "reports" DROP CONSTRAINT "FK_reports_project_id"`,
    );
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`DROP TYPE "public"."report_status"`);
    await queryRunner.query(`DROP TYPE "public"."report_type"`);
  }
}
