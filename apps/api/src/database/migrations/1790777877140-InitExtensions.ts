import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitExtensions1790777877140 implements MigrationInterface {
  name = 'InitExtensions1790777877140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS partman`);
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_partman`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS partman`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS unaccent`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
