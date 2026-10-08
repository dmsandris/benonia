import { freshDb, call } from '../tools/pg-harness.js';
import assert from 'node:assert/strict';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const as = uid => ({ role: 'authenticated', uid });

export default async function (t) {
  const db = await freshDb();

  await t('cek nama: format & ketersediaan (tamu boleh)', async () => {
    assert.equal((await call(db, 'api_checkusername', ['Ab'], { role: 'anon' })).ok, false);
    assert.equal((await call(db, 'api_checkusername', ['abre_01'], { role: 'anon' })).ok, true);
  });

  await t('buat karakter, state awal benar, nama unik', async () => {
    const st = await call(db, 'api_createcharacter', ['Abre_01'], as(A));
    assert.equal(st.username, 'abre_01');
    assert.deepEqual([st.level, st.exp, st.expNext, st.maxHp, st.zeny], [1, 0, 30, 100, 0]);
    await assert.rejects(call(db, 'api_createcharacter', ['abre_01'], as(B)), /sudah dipakai/);
    assert.equal((await call(db, 'api_checkusername', ['abre_01'], { role: 'anon' })).ok, false);
    const again = await call(db, 'api_createcharacter', ['lain'], as(A)); // sudah punya: tidak berubah
    assert.equal(again.username, 'abre_01');
  });

  await t('tanpa login ditolak', async () => {
    await assert.rejects(call(db, 'api_getstate', [], { role: 'anon' }), /permission denied/);
  });

  await t('simpan posisi; lompatan mustahil ditolak; HP dibatasi', async () => {
    let r = await call(db, 'api_saveprogress', [1300, 900, 80, 50], as(A));
    assert.equal(r.positionAccepted, true);
    r = await call(db, 'api_saveprogress', [2500, 100, 999, 999], as(A)); // lompat jauh seketika
    assert.equal(r.positionAccepted, false);
    const st = await call(db, 'api_getstate', [], as(A));
    assert.deepEqual([st.x, st.y, st.hp, st.mp], [1300, 900, 100, 60]);
    r = await call(db, 'api_saveprogress', [99999, 5, 50, 50], as(A)); // di luar peta
    assert.equal(r.positionAccepted, false);
  });

  await t('klaim kill memberi EXP + Zeny, drop dari server', async () => {
    const r = await call(db, 'api_claimkill', ['goblin:0', 'goblin'], as(A));
    assert.equal(r.ok, true);
    assert.equal(r.exp, 12);
    assert.ok(r.zeny >= 2 && r.zeny <= 6);
    assert.equal(r.state.exp, 12);
    assert.equal(r.state.kills, 1);
    for (const d of r.drops) assert.ok(['kain_goblin', 'obor_patah', 'stone_of_dunex'].includes(d.id));
  });

  await t('musuh sama tidak bisa diklaim lagi sebelum respawn', async () => {
    const r = await call(db, 'api_claimkill', ['goblin:0', 'goblin'], as(A));
    assert.deepEqual([r.ok, r.reason], [false, 'respawn']);
  });

  await t('musuh palsu & id titik aneh ditolak', async () => {
    await assert.rejects(call(db, 'api_claimkill', ['goblin:1', 'naga'], as(A)), /tidak dikenal/);
    await assert.rejects(call(db, 'api_claimkill', ["x'; drop", 'goblin'], as(A)), /tidak sah/);
    await assert.rejects(call(db, 'api_claimkill', ['hog:1', 'goblin'], as(A)), /bukan milik/);
  });

  await t('batas kill per menit', async () => {
    let last;
    for (let i = 1; i <= 30; i++) last = await call(db, 'api_claimkill', [`goblin:${100 + i}`, 'goblin'], as(A));
    assert.deepEqual([last.ok, last.reason], [false, 'rate']);
    const st = await call(db, 'api_getstate', [], as(A));
    assert.equal(st.kills, 24); // 1 + 23 diterima sampai batas 24/menit
  });

  await t('naik level: EXP sisa terbawa, HP/MP penuh', async () => {
    const st = await call(db, 'api_getstate', [], as(A));
    assert.ok(st.level >= 3, `level ${st.level}`);
    assert.equal(st.hp, st.maxHp);
    assert.ok(st.exp < st.expNext);
  });

  await t('tumbang: EXP level ini kembali 0, level tetap', async () => {
    const before = await call(db, 'api_getstate', [], as(A));
    const st = await call(db, 'api_playerdied', [], as(A));
    assert.deepEqual([st.level, st.exp, st.x], [before.level, 0, null]);
  });

  await t('pemain lain tidak terpengaruh', async () => {
    await call(db, 'api_createcharacter', ['budi'], as(B));
    const st = await call(db, 'api_getstate', [], as(B));
    assert.deepEqual([st.kills, st.zeny, st.inventory.length], [0, 0, 0]);
  });

  await db.close();
}
