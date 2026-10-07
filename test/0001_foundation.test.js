import { freshDb, call } from '../tools/pg-harness.js';
import assert from 'node:assert/strict';

export default async function (t) {
  const db = await freshDb();

  await t('api_ping bisa dipanggil tamu (anon)', async () => {
    const r = await call(db, 'api_ping', [], { role: 'anon' });
    assert.equal(r.ok, true);
    assert.equal(r.world, 'Benonia');
    assert.equal(r.schema, 1);
    assert.ok(Math.abs(r.serverTime - Date.now()) < 60_000);
  });

  await t('tabel schema game tertutup untuk anon & authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from game.config'), /permission denied/);
      await db.exec('reset role');
    }
  });

  await t('game.me() menolak tanpa login', async () => {
    await assert.rejects(db.query('select game.me()'), /Silakan login dulu/);
  });

  await t('game.me() mengembalikan uid dari sesi', async () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    await db.exec(`select set_config('test.uid', '${uid}', false)`);
    const r = await db.query('select game.me() as me');
    assert.equal(r.rows[0].me, uid);
    await db.exec(`select set_config('test.uid', '', false)`);
  });

  await t('fungsi yang di-expose hanya untuk login tidak bisa dipanggil anon', async () => {
    await db.exec(`
      create or replace function public.api_test_private(a jsonb default '[]') returns jsonb
      language sql security definer as $$ select '{"ok":true}'::jsonb $$;
      select game.expose('api_test_private');`);
    await assert.rejects(call(db, 'api_test_private', [], { role: 'anon' }), /permission denied/);
    const r = await call(db, 'api_test_private', [], { role: 'authenticated', uid: '22222222-2222-2222-2222-222222222222' });
    assert.equal(r.ok, true);
  });

  await t('helper argumen membaca array', async () => {
    const r = await db.query(`select game.arg_text('["a", 5]', 0) as s, game.arg_int('["a", 5]', 1) as n, game.arg('{"x":1}', 0) as bad`);
    assert.deepEqual([r.rows[0].s, r.rows[0].n, r.rows[0].bad], ['a', 5, null]);
  });

  await db.close();
}
