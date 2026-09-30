import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.14: `alert_rules`, `alert_events`, `notification_channels`
 * (ARCHITECTURE §5.7, §11). `alert_events` unique `(rule_id, dedupe_key)`;
 * dedupe ve cooldown bu satır üzerinden `ON CONFLICT ... DO UPDATE ... WHERE`
 * ile uygulanır (bkz. `alert-events.store.ts`). `notification_channels.config_encrypted`
 * `CryptoService` ile şifrelenir (webhook URL'leri secret sayılır).
 * Faz 2'nin genel otomasyon motoruna geçişini kolaylaştırmak için tablolar sade tutuldu.
 */
export class CreateAlertsAndNotifications1791700000000 implements MigrationInterface {
  name = 'CreateAlertsAndNotifications1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."alert_rule_type" AS ENUM('rank_drop', 'rank_exit', 'traffic_drop', 'sync_failure')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_channel_type" AS ENUM('email', 'discord', 'slack')`,
    );

    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "name" text NOT NULL,
        "type" "public"."alert_rule_type" NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "cooldown_hours" smallint NOT NULL DEFAULT 24,
        CONSTRAINT "PK_alert_rules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_alert_rules_org_id_project_id" ON "alert_rules" ("org_id", "project_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "alert_rules"
        ADD CONSTRAINT "FK_alert_rules_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "alert_events" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "rule_id" uuid NOT NULL,
        "dedupe_key" text NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "severity" text NOT NULL DEFAULT 'warning',
        "triggered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "notified_at" TIMESTAMP WITH TIME ZONE,
        "notify_error" text,
        CONSTRAINT "PK_alert_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_alert_events_rule_id_dedupe_key" ON "alert_events" ("rule_id", "dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_alert_events_org_id_project_id_triggered_at" ON "alert_events" ("org_id", "project_id", "triggered_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "alert_events"
        ADD CONSTRAINT "FK_alert_events_rule_id"
        FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_channels" (
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "org_id" uuid NOT NULL,
        "type" "public"."notification_channel_type" NOT NULL,
        "name" text NOT NULL,
        "config_encrypted" text NOT NULL,
        CONSTRAINT "PK_notification_channels" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_channels_org_id" ON "notification_channels" ("org_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "notification_channels"
        ADD CONSTRAINT "FK_notification_channels_org_id"
        FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_channels" DROP CONSTRAINT "FK_notification_channels_org_id"`,
    );
    await queryRunner.query(`DROP TABLE "notification_channels"`);
    await queryRunner.query(
      `ALTER TABLE "alert_events" DROP CONSTRAINT "FK_alert_events_rule_id"`,
    );
    await queryRunner.query(`DROP TABLE "alert_events"`);
    await queryRunner.query(
      `ALTER TABLE "alert_rules" DROP CONSTRAINT "FK_alert_rules_project_id"`,
    );
    await queryRunner.query(`DROP TABLE "alert_rules"`);
    await queryRunner.query(`DROP TYPE "public"."notification_channel_type"`);
    await queryRunner.query(`DROP TYPE "public"."alert_rule_type"`);
  }
}
