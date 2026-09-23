import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class Integrity1790121600001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const column of [
      new TableColumn({ name: 'version', type: 'integer', default: 1 }),
      new TableColumn({ name: 'importKey', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'creditOf', type: 'integer', isNullable: true }),
      new TableColumn({ name: 'accountingMonth', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'fiscalMonth', type: 'varchar', isNullable: true }),
    ]) {
      if (!(await q.hasColumn('factures', column.name))) await q.addColumn('factures', column);
    }
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_import ON factures(importKey)');
    await q.query('CREATE INDEX IF NOT EXISTS ix_factures_period ON factures(archivee, datePaie, dateFac)');
    await q.query('CREATE INDEX IF NOT EXISTS ix_records_kind ON workspace_records(kind)');
  }
  async down(): Promise<void> {
    throw new Error('Migration additive : restauration via la sauvegarde intégrale, sans supprimer les données.');
  }
}
