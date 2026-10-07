// Database uji: PGlite (Postgres di Node) + tiruan bagian Supabase
// yang dipakai migrasi (role anon/authenticated, auth.uid()).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const migrationsDir = join(root, 'supabase', 'migrations');

export function migrationFiles() {
  return readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
}

const SUPABASE_STUB = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

export async function freshDb({ runTwice = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const passes = runTwice ? 2 : 1; // pass ke-2 membuktikan migrasi idempotent
  for (let p = 0; p < passes; p++) {
    for (const f of migrationFiles()) {
      try {
        await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
      } catch (e) {
        throw new Error(`Migrasi ${f} gagal (pass ${p + 1}): ${e.message}`);
      }
    }
  }
  return db;
}

// Panggil api_* sebagai role tertentu, persis seperti supabase.rpc.
export async function call(db, fn, args = [], { role = 'authenticated', uid = null } = {}) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false); set role ${role};`);
  try {
    const r = await db.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(args)]);
    return r.rows[0].r;
  } finally {
    await db.exec('reset role;');
  }
}
