// Katalog aset Tiny Swords. Dipakai oleh game (Phaser) DAN pembuat peta (Node),
// jadi file ini tidak boleh mengimpor Phaser.
//
// anchor = titik di dalam frame yang menempel ke posisi dunia (umumnya kaki/pangkal).
// body   = kotak tabrakan [lebar, tinggi] yang alasnya di anchor. Tanpa body = bisa dilewati.
// fps    = animasi berulang; start acak supaya pohon tidak bergoyang serempak.

export const TILE = 64;

export const SPRITES = {
  // --- pohon (8 frame bergoyang) ---
  tree1: { file: 'ts/nature/tree1.png', fw: 192, fh: 256, frames: 8, fps: 6, anchor: [96, 236], body: [36, 18] },
  tree2: { file: 'ts/nature/tree2.png', fw: 192, fh: 256, frames: 8, fps: 6, anchor: [96, 244], body: [36, 18] },
  tree3: { file: 'ts/nature/tree3.png', fw: 192, fh: 192, frames: 8, fps: 6, anchor: [96, 166], body: [34, 16] },
  tree4: { file: 'ts/nature/tree4.png', fw: 192, fh: 192, frames: 8, fps: 6, anchor: [96, 164], body: [30, 16] },
  // --- semak (8 frame) & batu ---
  bush1: { file: 'ts/nature/bush1.png', fw: 128, fh: 128, frames: 8, fps: 6, anchor: [64, 76], body: [50, 18] },
  bush2: { file: 'ts/nature/bush2.png', fw: 128, fh: 128, frames: 8, fps: 6, anchor: [64, 74], body: [36, 16] },
  bush3: { file: 'ts/nature/bush3.png', fw: 128, fh: 128, frames: 8, fps: 6, anchor: [62, 80], body: [60, 20] },
  bush4: { file: 'ts/nature/bush4.png', fw: 128, fh: 128, frames: 8, fps: 6, anchor: [63, 76], body: [36, 16] },
  rock1: { file: 'ts/nature/rock1.png', fw: 64, fh: 64, anchor: [31, 48], body: [28, 14] },
  rock2: { file: 'ts/nature/rock2.png', fw: 64, fh: 64, anchor: [32, 50], body: [44, 18] },
  rock3: { file: 'ts/nature/rock3.png', fw: 64, fh: 64, anchor: [33, 49], body: [34, 16] },
  rock4: { file: 'ts/nature/rock4.png', fw: 64, fh: 64, anchor: [32, 53], body: [52, 22] },
  // --- air ---
  foam: { file: 'ts/ground/foam.png', fw: 192, fh: 192, frames: 16, fps: 10, anchor: [96, 96], layer: 'foam' },
  waterrock1: { file: 'ts/nature/waterrock1.png', fw: 64, fh: 64, frames: 16, fps: 8, anchor: [32, 44], body: [26, 14] },
  waterrock2: { file: 'ts/nature/waterrock2.png', fw: 64, fh: 64, frames: 16, fps: 8, anchor: [32, 44], body: [26, 14] },
  // --- makhluk hiasan ---
  sheep: { file: 'ts/nature/sheep-idle.png', fw: 128, fh: 128, frames: 6, fps: 6, anchor: [64, 82], body: [36, 12] },
  // --- reruntuhan ---
  castle: { file: 'ts/ruins/castle.png', fw: 320, fh: 256, anchor: [160, 246], body: [290, 70] },
  tower: { file: 'ts/ruins/tower.png', fw: 128, fh: 256, anchor: [64, 226], body: [104, 50] },
  house: { file: 'ts/ruins/house.png', fw: 128, fh: 192, anchor: [64, 162], body: [84, 40] },
  // --- hiasan kecil (dilewati) ---
  mushroom1: { file: 'ts/deco/01.png', fw: 64, fh: 64, anchor: [32, 52] },
  mushroom2: { file: 'ts/deco/02.png', fw: 64, fh: 64, anchor: [32, 52] },
  mushroom3: { file: 'ts/deco/03.png', fw: 64, fh: 64, anchor: [32, 52] },
  pebble1: { file: 'ts/deco/04.png', fw: 64, fh: 64, anchor: [32, 52] },
  pebble2: { file: 'ts/deco/05.png', fw: 64, fh: 64, anchor: [32, 52] },
  boulder: { file: 'ts/deco/06.png', fw: 64, fh: 64, anchor: [32, 52], body: [36, 14] },
  shrub1: { file: 'ts/deco/07.png', fw: 64, fh: 64, anchor: [32, 52] },
  shrub2: { file: 'ts/deco/08.png', fw: 64, fh: 64, anchor: [32, 52] },
  shrub3: { file: 'ts/deco/09.png', fw: 64, fh: 64, anchor: [32, 52] },
  sprout1: { file: 'ts/deco/10.png', fw: 64, fh: 64, anchor: [32, 52] },
  sprout2: { file: 'ts/deco/11.png', fw: 64, fh: 64, anchor: [32, 52] },
  pumpkin1: { file: 'ts/deco/12.png', fw: 64, fh: 64, anchor: [32, 52] },
  pumpkin2: { file: 'ts/deco/13.png', fw: 64, fh: 64, anchor: [32, 52] },
  bone1: { file: 'ts/deco/14.png', fw: 64, fh: 64, anchor: [32, 52] },
  bone2: { file: 'ts/deco/15.png', fw: 64, fh: 64, anchor: [32, 52] },
  signSkull: { file: 'ts/deco/16.png', fw: 64, fh: 128, anchor: [32, 120], body: [14, 10] },
  signArrow: { file: 'ts/deco/17.png', fw: 64, fh: 128, anchor: [32, 120], body: [14, 10] },
};

// Pemain: Warrior biru. Hanya menghadap kiri/kanan (flipX), seperti aslinya.
export const WARRIOR = {
  fw: 192, fh: 192, anchor: [96, 137], body: [30, 14],
  anims: {
    idle: { file: 'ts/units/warrior-idle.png', frames: 8, fps: 10, repeat: -1 },
    run: { file: 'ts/units/warrior-run.png', frames: 6, fps: 12, repeat: -1 },
    attack1: { file: 'ts/units/warrior-attack1.png', frames: 4, fps: 14, repeat: 0 },
    attack2: { file: 'ts/units/warrior-attack2.png', frames: 4, fps: 14, repeat: 0 },
    guard: { file: 'ts/units/warrior-guard.png', frames: 6, fps: 10, repeat: -1 },
  },
};

// Tileset lantai (rumput & pasir). 10 kolom x 4 baris tile 64px.
// Tidak ada tile sudut-dalam; bentuk dibuat cembung oleh pembuat peta.
export const FLAT = { file: 'ts/ground/flat.png', w: 640, h: 256 };
export const WATER_TILE = 'ts/ground/water.png';
