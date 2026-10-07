// Peta 1: Hutan Awal. Jalankan: node tools/mapgen/forest.js
// Hasil: web/public/assets/maps/forest.tmj (format Tiled JSON)
//
// Tata letak (ubah di sini, lalu jalankan ulang):
//  - lingkar luar pohon rapat (batas peta)
//  - lapangan tanah di tengah = titik muncul pemain
//  - jalan tanah dari tepi barat -> tengah -> reruntuhan di timur laut
//  - cabang jalan ke danau di barat daya
//  - kelompok pohon, semak, batu, bunga di sela-sela
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from './tiles.js';
import { Grid, rng, buildTilesets, autotile, cleanThin, toTmj, TILE } from './lib.js';

const W = 64, H = 44, SEED = 1207;
const R = rng(SEED);
const { gid, json: tilesets } = buildTilesets();

const ground = new Grid(W, H), decor = new Grid(W, H), low = new Grid(W, H), high = new Grid(W, H);
const collide = new Grid(W, H);
const dirt = new Grid(W, H), water = new Grid(W, H);
const used = new Grid(W, H);    // sel sudah terisi objek
const keepOpen = new Grid(W, H); // sel yang tidak boleh diisi pohon/semak

const spawn = { x: 32, y: 23 };
const plaza = { x: 51, y: 11 };          // depan reruntuhan
const lake = { x0: 5, y0: 30, x1: 14, y1: 37 };

// ---------- 1. Tanah: lapangan + jalan ----------
const disk = (cx, cy, r, g = dirt) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g.set(x, y, 1);
};
const path = (pts, r) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s <= len; s += 0.5) {
      const k = s / len;
      const wob = Math.sin((i * 7 + s) * 0.45) * 0.9;
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      disk(ax + (bx - ax) * k + nx * wob, ay + (by - ay) * k + ny * wob, r);
    }
  }
};
disk(spawn.x, spawn.y, 4.6);
disk(plaza.x, plaza.y, 3.6);
path([[0, 21], [10, 22], [20, 20], [spawn.x - 3, spawn.y]], 1.6);
path([[spawn.x + 3, spawn.y - 1], [40, 18], [46, 13], [plaza.x - 2, plaza.y]], 1.6);
path([[spawn.x - 2, spawn.y + 3], [26, 30], [18, 33], [lake.x1 + 2, 33]], 1.5);
// tanah tidak boleh menyentuh danau
for (let y = lake.y0 - 1; y <= lake.y1 + 1; y++) for (let x = lake.x0 - 1; x <= lake.x1 + 1; x++) dirt.set(x, y, 0);
cleanThin(dirt);

// ---------- 2. Danau ----------
for (let y = lake.y0; y <= lake.y1; y++) for (let x = lake.x0; x <= lake.x1; x++) water.set(x, y, 1);
// potong sudut biar tidak kotak sempurna (tetap cembung)
for (const [x, y] of [[lake.x0, lake.y0], [lake.x1, lake.y1], [lake.x1, lake.y0]]) water.set(x, y, 0);
cleanThin(water);

// ---------- 3. Lantai ----------
ground.each((x, y) => {
  if (water.get(x, y)) {
    ground.set(x, y, gid.water(autotile(water, x, y, T.WATER)));
    collide.set(x, y, 1);
  } else if (dirt.get(x, y)) {
    ground.set(x, y, gid.floor(autotile(dirt, x, y, T.DIRT, () => R.pick(T.DIRT_VAR))));
  } else {
    ground.set(x, y, gid.floor(R.chance(0.1) ? R.pick(T.GRASS_VAR) : T.GRASS));
  }
});

// sel terbuka: tanah, air, dan 1 sel di sekitarnya; area muncul
const markOpen = (g, pad) => g.each((x, y, v) => {
  if (!v) return;
  for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) keepOpen.set(x + dx, y + dy, 1);
});
markOpen(dirt, 1);
markOpen(water, 1);
disk(spawn.x, spawn.y, 6.5, keepOpen);

// ---------- 4. Reruntuhan ----------
const putBlock = (x0, y0, rows, set, { highRows, collideRows }) => {
  rows.forEach((row, ry) => row.forEach((id, rx) => {
    const x = x0 + rx, y = y0 + ry;
    (highRows.includes(ry) ? high : low).set(x, y, set(id));
    if (collideRows.includes(ry)) collide.set(x, y, 1);
    used.set(x, y, 1); keepOpen.set(x, y, 1);
  }));
};
const cave = { x: plaza.x - 2, y: plaza.y - 6 };
putBlock(cave.x, cave.y, T.RUIN_CAVE, gid.ruins, { highRows: [0, 1], collideRows: [1, 2] });
for (const px of [cave.x - 3, cave.x + 6])
  putBlock(px, cave.y + 1, T.RUIN_PILLAR.map(id => [id]), gid.ruins, { highRows: [0, 1], collideRows: [2] });
// sel di antara reruntuhan dan plaza tetap kosong
for (let y = cave.y; y <= plaza.y; y++) for (let x = cave.x - 4; x <= cave.x + 7; x++) keepOpen.set(x, y, 1);

// ---------- 5. Pohon ----------
const free2 = (x, y) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) =>
  used.in(x + dx, y + dy) && !used.get(x + dx, y + dy) && !keepOpen.get(x + dx, y + dy));
const tree = (x, y, kind) => {
  const [a, b, c, d] = kind;
  high.set(x, y, gid.nature(a)); high.set(x + 1, y, gid.nature(b));
  low.set(x, y + 1, gid.nature(c)); low.set(x + 1, y + 1, gid.nature(d));
  collide.set(x, y + 1, 1); collide.set(x + 1, y + 1, 1);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) used.set(x + dx, y + dy, 1);
};
const treeKind = (x, y) => {
  // pinus lebih banyak di utara, pohon bulat di selatan
  if (y < 10 && R.chance(0.55)) return T.PINE;
  return R.pick(T.TREES);
};

// 5a. batas peta: 3 lapis pohon rapat (jalan barat tetap terbuka)
const BAND = 5;
for (let y = 0; y <= H - 2; y += 2) {
  const shift = (y / 2) % 2; // baris selang-seling digeser 1 sel biar tidak seperti kisi
  for (let x = shift; x <= W - 2; x += 2) {
    const edge = Math.min(x, y, W - 2 - x, H - 2 - y);
    if (edge >= BAND) continue;
    // lapis terdalam sedikit bolong supaya tepi hutan terlihat alami
    if (edge >= BAND - 2 && R.chance(0.35)) continue;
    if (free2(x, y)) tree(x, y, treeKind(x, y));
  }
}
// isi celah kecil di pojok luar
for (let y = 0; y <= H - 2; y++) for (let x = 0; x <= W - 2; x++) {
  const edge = Math.min(x, y, W - 2 - x, H - 2 - y);
  if (edge <= 1 && free2(x, y)) tree(x, y, treeKind(x, y));
}
// tutup sisa celah di pinggir dengan collide tak terlihat (pemain tetap di dalam)
for (let x = 0; x < W; x++) { collide.set(x, 0, 1); collide.set(x, H - 1, 1); }
for (let y = 0; y < H; y++) { collide.set(W - 1, y, 1); if (!dirt.get(0, y)) collide.set(0, y, 1); }

// 5b. kelompok pohon di dalam
const clusters = 18;
for (let i = 0; i < clusters; i++) {
  const cx = R.int(4, W - 6), cy = R.int(4, H - 6), n = R.int(3, 8);
  for (let k = 0; k < n * 3; k++) {
    const x = cx + R.int(-4, 4), y = cy + R.int(-3, 3);
    if (free2(x, y)) tree(x, y, treeKind(x, y));
  }
}
// 5c. pohon tunggal
for (let i = 0; i < 40; i++) {
  const x = R.int(3, W - 5), y = R.int(3, H - 5);
  if (free2(x, y)) tree(x, y, treeKind(x, y));
}

// ---------- 6. Semak, batu, tunggul (menghalangi) ----------
const free1 = (x, y) => used.in(x, y) && !used.get(x, y) && !keepOpen.get(x, y);
const prop = (x, y, id) => { low.set(x, y, gid.nature(id)); collide.set(x, y, 1); used.set(x, y, 1); };
for (let i = 0; i < 70; i++) {
  const x = R.int(2, W - 3), y = R.int(2, H - 3);
  if (!free1(x, y)) continue;
  const r = R();
  prop(x, y, r < 0.6 ? R.pick(T.BUSHES) : r < 0.9 ? R.pick(T.ROCKS) : T.STUMP);
}
// batu besar 2x2 dekat danau
{
  const x = lake.x1 + 3, y = lake.y0 - 2;
  if (free2(x, y)) {
    const [a, b, c, d] = T.BIG_ROCK;
    low.set(x, y, gid.nature(a)); low.set(x + 1, y, gid.nature(b));
    low.set(x, y + 1, gid.nature(c)); low.set(x + 1, y + 1, gid.nature(d));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { collide.set(x + dx, y + dy, 1); used.set(x + dx, y + dy, 1); }
  }
}

// ---------- 7. Hiasan (bisa dilewati) ----------
decor.each((x, y) => {
  if (used.get(x, y) || dirt.get(x, y) || water.get(x, y)) return;
  const near = Math.hypot(x - spawn.x, y - spawn.y) < 9;
  if (R.chance(near ? 0.07 : 0.05)) decor.set(x, y, gid.nature(R.chance(0.4) ? R.pick(T.FLOWERS) : R.pick(T.TUFTS)));
});

// ---------- 8. Simpan ----------
const solid = gid.floor(T.GRASS);
collide.each((x, y, v) => collide.set(x, y, v ? solid : 0));

const tmj = toTmj({
  w: W, h: H, tilesets,
  layers: [
    { name: 'ground', grid: ground },
    { name: 'decor', grid: decor },
    { name: 'low', grid: low },
    { name: 'high', grid: high },
    { name: 'collide', grid: collide, visible: false },
  ],
  objects: [{ name: 'spawn', x: spawn.x * TILE + TILE / 2, y: spawn.y * TILE + TILE / 2 }],
});

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'assets', 'maps', 'forest.tmj');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tmj));
console.log(`forest.tmj ${W}x${H} -> ${out}`);
