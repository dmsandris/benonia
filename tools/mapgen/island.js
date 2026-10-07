// Peta 1: Pulau Awal (gaya Tiny Swords). Jalankan: npm run map
// Hasil: web/public/assets/maps/island.tmj
//
// Susunan (ubah angka di sini lalu jalankan ulang):
//  - pulau di tengah laut, pantai pasir tipis di sebagian tepi, buih ombak beranimasi
//  - lapangan pasir di tengah = titik muncul pemain
//  - jalan pasir: tengah -> reruntuhan kastel (timur laut), -> dermaga barat, -> kolam barat daya
//  - hutan di pinggir pulau, padang domba di tenggara, semak/batu/jamur di sela-sela
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, FLAT } from '../../web/src/catalog.js';
import { Grid, rng, autotile16, cleanThin, toTmj } from './lib.js';

const W = 40, H = 28, SEED = 4242;
const R = rng(SEED);
const COLS = FLAT.w / TILE;          // 10 kolom
const GRASS = 0, SAND = 5;           // id kiri-atas blok di flat.png
const gid = id => 1 + id;            // satu tileset, firstgid 1

const land = new Grid(W, H), grass = new Grid(W, H), path = new Grid(W, H);
const used = new Grid(W, H), keepOpen = new Grid(W, H);
const objects = [];

// ---------- 1. Bentuk pulau ----------
const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
const noise = (x, y) =>
  0.5 * Math.sin(x * 0.45 + ph[0]) * Math.cos(y * 0.5 + ph[1]) +
  0.5 * Math.sin((x + y) * 0.31 + ph[2]) + 0.3 * Math.cos((x - y) * 0.6 + ph[3]);
land.each((x, y) => {
  const nx = (x + 0.5 - W / 2) / (W / 2 - 2.5), ny = (y + 0.5 - H / 2) / (H / 2 - 2.5);
  const d = Math.pow(Math.abs(nx) ** 3 + Math.abs(ny) ** 3, 1 / 3); // pulau agak kotak
  land.set(x, y, d < 1 + 0.09 * noise(x, y) ? 1 : 0);
});
for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) land.set(x, y, 0);
for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) land.set(x, y, 0);
cleanThin(land);
// isi danau kecil yang tidak sengaja terbentuk (hanya laut luar yang boleh air)
{
  const sea = new Grid(W, H), q = [[0, 0]]; sea.set(0, 0, 1);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy;
      if (land.in(a, b) && !land.get(a, b) && !sea.get(a, b)) { sea.set(a, b, 1); q.push([a, b]); }
    }
  }
  land.each((x, y, v) => { if (!v && !sea.get(x, y)) land.set(x, y, 1); });
}
// kolam di barat daya
const pond = { x0: 9, y0: 17, x1: 13, y1: 19 };
for (let y = pond.y0; y <= pond.y1; y++) for (let x = pond.x0; x <= pond.x1; x++) land.set(x, y, 0);

const water = (x, y) => !land.get(x, y);
const nearWater = (x, y, r) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (water(x + dx, y + dy)) return true;
  return false;
};

// ---------- 2. Jalan & lapangan pasir ----------
const spawn = { x: 20, y: 14 };
const plaza = { x: 29, y: 8 };
const disk = (g, cx, cy, r) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g.set(x, y, 1);
};
const road = (pts, r) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s <= len; s += 0.25) disk(path, ax + (bx - ax) * s / len, ay + (by - ay) * s / len, r);
  }
};
disk(path, spawn.x, spawn.y, 1.8);
disk(path, plaza.x, plaza.y + 1, 1.9);
road([[spawn.x, spawn.y], [23, 12], [26, 10], [plaza.x, plaza.y + 1]], 0.95);
road([[spawn.x, spawn.y], [15, 14], [10, 13], [3, 13]], 0.95);
road([[spawn.x, spawn.y], [17, 17], [15, 18]], 0.95);

// ---------- 3. Rumput = darat - jalan - sebagian pantai ----------
grass.each((x, y) => {
  if (!land.get(x, y) || path.get(x, y)) return;
  const beach = nearWater(x, y, 1) && noise(x * 1.7, y * 1.7) > -0.15;
  grass.set(x, y, beach ? 0 : 1);
});
cleanThin(grass);

// ---------- 4. Layer tile ----------
const sandL = new Grid(W, H), grassL = new Grid(W, H), collide = new Grid(W, H);
land.each((x, y, v) => {
  if (!v) { collide.set(x, y, gid(SAND + 11)); return; }
  sandL.set(x, y, gid(autotile16(land, x, y, SAND, COLS)));
  if (grass.get(x, y)) grassL.set(x, y, gid(autotile16(grass, x, y, GRASS, COLS)));
});

// ---------- 5. Objek ----------
const at = (cx, cy, jx = 0, jy = 0) => ({ x: cx * TILE + TILE / 2 + jx, y: cy * TILE + TILE - 8 + jy });
const put = (type, cx, cy, opt = {}) => {
  const p = at(cx, cy, opt.jx ?? R.int(-8, 8), opt.jy ?? R.int(-4, 4));
  objects.push({ type, ...p, name: opt.name });
  used.set(cx, cy, 1);
};
const open = (x, y) => land.get(x, y) && !used.get(x, y) && !keepOpen.get(x, y);

// buih ombak di setiap tepi darat yang menyentuh air
land.each((x, y, v) => {
  if (v && (water(x, y - 1) || water(x, y + 1) || water(x - 1, y) || water(x + 1, y)))
    objects.push({ type: 'foam', x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
});

// area yang harus tetap lapang
path.each((x, y, v) => { if (v) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) keepOpen.set(x + dx, y + dy, 1); });
disk(keepOpen, spawn.x, spawn.y, 3.5);
for (let y = plaza.y - 4; y <= plaza.y + 1; y++) for (let x = plaza.x - 5; x <= plaza.x + 5; x++) keepOpen.set(x, y, 1);

// reruntuhan kastel di utara plaza
objects.push({ type: 'castle', ...at(plaza.x, plaza.y - 2, 0, 0) });
objects.push({ type: 'tower', ...at(plaza.x - 4, plaza.y - 1, 0, 0) });
objects.push({ type: 'house', ...at(plaza.x + 4, plaza.y, 0, 0) });
objects.push({ type: 'signSkull', ...at(plaza.x - 2, plaza.y + 2, 10, 0) });
objects.push({ type: 'signArrow', ...at(spawn.x + 2, spawn.y - 2, 0, 0) });

// hutan: lebih rapat di dekat pantai, jarang di tengah
const spaced = (x, y) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if ((dx || dy) && used.get(x + dx, y + dy) === 2) return false;
  return true;
};
land.each((x, y) => {
  if (!grass.get(x, y) || !open(x, y)) return;
  const edge = nearWater(x, y, 3) ? 0.62 : nearWater(x, y, 5) ? 0.3 : 0.07;
  if (R.chance(edge) && (spaced(x, y) || R.chance(0.35))) {
    // pinus di utara, pohon bulat di selatan
    const t = y < H / 2 ? R.pick(['tree1', 'tree2', 'tree2', 'tree3']) : R.pick(['tree3', 'tree4', 'tree4', 'tree1']);
    put(t, x, y); used.set(x, y, 2);
  }
});

// padang domba di tenggara (dibersihkan dari pohon dulu)
const meadow = { x: 28, y: 20 };
for (let i = objects.length - 1; i >= 0; i--) {
  const o = objects[i];
  if (o.type.startsWith('tree') && Math.hypot(o.x / TILE - meadow.x, o.y / TILE - meadow.y) < 3.2) {
    objects.splice(i, 1); used.set(Math.floor(o.x / TILE), Math.floor(o.y / TILE), 0);
  }
}
for (let i = 0; i < 4; i++) {
  const x = meadow.x + R.int(-2, 2), y = meadow.y + R.int(-1, 1);
  if (open(x, y) && grass.get(x, y)) put('sheep', x, y);
}

// semak, batu, hiasan
const bushes = ['bush1', 'bush2', 'bush3', 'bush4'], rocks = ['rock1', 'rock2', 'rock3', 'rock4'];
const decor = ['mushroom1', 'mushroom2', 'mushroom3', 'pebble1', 'pebble2', 'shrub1', 'shrub2', 'shrub3', 'sprout1', 'sprout2', 'pumpkin1', 'pumpkin2'];
for (let i = 0; i < 45; i++) {
  const x = R.int(2, W - 3), y = R.int(2, H - 3);
  if (open(x, y) && grass.get(x, y)) put(R.pick(bushes), x, y);
}
for (let i = 0; i < 30; i++) {
  const x = R.int(2, W - 3), y = R.int(2, H - 3);
  if (open(x, y)) put(R.pick(rocks), x, y);
}
for (let i = 0; i < 90; i++) {
  const x = R.int(2, W - 3), y = R.int(2, H - 3);
  if (land.get(x, y) && !used.get(x, y) && !path.get(x, y)) {
    objects.push({ type: R.pick(decor), ...at(x, y, R.int(-16, 16), R.int(-16, 8)) });
    used.set(x, y, 3);
  }
}
for (const [a, b] of [[spawn.x - 6, spawn.y + 3], [plaza.x + 2, plaza.y + 4]]) if (land.get(a, b)) objects.push({ type: 'bone1', ...at(a, b) });

// batu di laut dekat pantai
for (let i = 0; i < 60; i++) {
  const x = R.int(1, W - 2), y = R.int(1, H - 2);
  if (water(x, y)) {
    let coast = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (land.get(x + dx, y + dy)) coast = true;
    const touching = land.get(x + 1, y) || land.get(x - 1, y) || land.get(x, y + 1) || land.get(x, y - 1);
    if (coast && !touching && !used.get(x, y) && R.chance(0.4)) put(R.pick(['waterrock1', 'waterrock2']), x, y);
  }
}

objects.push({ name: 'spawn', type: 'spawn', x: spawn.x * TILE + TILE / 2, y: spawn.y * TILE + TILE / 2 });

// ---------- 6. Simpan ----------
const tmj = toTmj({
  w: W, h: H, tile: TILE,
  tilesets: [{
    firstgid: 1, name: 'flat', image: '../' + FLAT.file, imagewidth: FLAT.w, imageheight: FLAT.h,
    tilewidth: TILE, tileheight: TILE, columns: COLS, tilecount: COLS * (FLAT.h / TILE), margin: 0, spacing: 0,
  }],
  layers: [
    { name: 'sand', grid: sandL },
    { name: 'grass', grid: grassL },
    { name: 'collide', grid: collide, visible: false },
  ],
  objects,
});

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'assets', 'maps', 'island.tmj');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tmj));
const count = objects.reduce((m, o) => (m[o.type] = (m[o.type] || 0) + 1, m), {});
console.log(`island.tmj ${W}x${H} tile ${TILE}px ->`, out, '\n', count);
