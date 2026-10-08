import { freshDb, call } from '../tools/pg-harness.js';
import assert from 'node:assert/strict';

const A = '33333333-3333-3333-3333-333333333333';
const as = { role: 'authenticated', uid: A };

export default async function (t) {
  const db = await freshDb();
  await call(db, 'api_createcharacter', ['pemburu'], as);

  await t('babi hutan memberi 30 EXP & drop miliknya', async () => {
    const r = await call(db, 'api_claimkill', ['hog:0', 'hog'], as);
    assert.equal(r.ok, true);
    assert.equal(r.exp, 30);
    assert.ok(r.zeny >= 6 && r.zeny <= 14);
    for (const d of r.drops) assert.ok(['taring_babi', 'daging_babi', 'stone_of_dunex'].includes(d.id));
  });

  await t('ular memberi 22 EXP & drop miliknya', async () => {
    const r = await call(db, 'api_claimkill', ['snake:2', 'snake'], as);
    assert.equal(r.ok, true);
    assert.equal(r.exp, 22);
    for (const d of r.drops) assert.ok(['sisik_ular', 'kantung_bisa', 'stone_of_dunex'].includes(d.id));
  });

  await t('titik muncul harus cocok dengan jenis musuh (tidak bisa klaim goblin sebagai babi)', async () => {
    await assert.rejects(call(db, 'api_claimkill', ['goblin:3', 'hog'], as), /bukan milik/);
  });

  await t('respawn babi 35 dtk berlaku per titik', async () => {
    const r = await call(db, 'api_claimkill', ['hog:0', 'hog'], as);
    assert.deepEqual([r.ok, r.reason], [false, 'respawn']);
    assert.equal((await call(db, 'api_claimkill', ['hog:1', 'hog'], as)).ok, true);
  });

  await t('drop rata-rata wajar (200 lemparan)', async () => {
    // panggil langsung di level SQL supaya tidak kena batas per menit
    await db.exec(`delete from game.kill_log`);
    let tusks = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      await db.exec(`delete from game.kill_log`);
      const r = await call(db, 'api_claimkill', [`hog:${i}`, 'hog'], as);
      n++; if (r.drops.some(d => d.id === 'taring_babi')) tusks++;
    }
    assert.ok(tusks / n > 0.35 && tusks / n < 0.65, `taring ${tusks}/${n}`);
  });

  await db.close();
}
