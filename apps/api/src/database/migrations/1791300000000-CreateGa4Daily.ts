import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1.6: `ga4_daily` (ARCHITECTURE §5.4, §6). Aylık range partition, pg_partman
 * yönetir (`partman.create_parent`), tıpkı `gsc_page_daily`/`gsc_daily` gibi
 * (1791200000000). `landing_page_hash` `md5(text)` (char(32)).
 *
 * `down` partman kaydını (`part_config`) ve partman'ın açtığı şablon tabloyu
 * da siler; parent'ı düşürmek partition'ları da düşürür.
 */
export class CreateGa4Daily1791300000000 implements MigrationInterface {
  name = 'CreateGa4Daily1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ga4_daily" (
        "date"              date          NOT NULL,
        "org_id"            uuid          NOT NULL,
        "project_id"        uuid          NOT NULL,
        "landing_page"      text          NOT NULL,
        "landing_page_hash" char(32)      NOT NULL,
        "channel_group"     varchar(50)   NOT NULL,
        "sessions"          integer       NOT NULL,
        "engaged_sessions"  integer       NOT NULL,
        "key_events"        integer       NOT NULL,
        "total_revenue"     numeric(14,2) NOT NULL,
        CONSTRAINT "PK_ga4_daily" PRIMARY KEY ("date", "project_id", "landing_page_hash", "channel_group")
      ) PARTITION BY RANGE ("date")
    `);
    await this.createMonthlyPartitions(queryRunner, 'ga4_daily');
    await queryRunner.query(
      `CREATE INDEX "IDX_ga4_daily_project_id_date" ON "ga4_daily" ("project_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ga4_daily_project_id_channel_group_date" ON "ga4_daily" ("project_id", "channel_group", "date")`,
    );
    await queryRunner.query(`
      ALTER TABLE "ga4_daily"
        ADD CONSTRAINT "FK_ga4_daily_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropPartitionedTable(queryRunner, 'ga4_daily');
  }

  /**
   * ARCHITECTURE §6. `p_start_partition`: GA4 backfill'i 14 ay geriye gider,
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
