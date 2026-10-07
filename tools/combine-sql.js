// Gabung semua migrasi (urut nama) jadi satu file untuk psql --single-transaction.
// Pemakaian: node tools/combine-sql.js > all.sql
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrationsDir, migrationFiles } from './pg-harness.js';

for (const f of migrationFiles()) {
  process.stdout.write(`\n-- ===== ${f} =====\n`);
  process.stdout.write(readFileSync(join(migrationsDir, f), 'utf8'));
  process.stdout.write('\n');
}
