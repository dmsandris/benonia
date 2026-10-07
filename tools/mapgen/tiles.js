// Katalog tile Ninja Adventure yang dipakai pembuat peta.
// Angka = id lokal di tileset (0-based, baris x kolom tileset).

export const TILESETS = [
  // name dipakai juga sebagai key tekstur di Phaser.
  { name: 'floor',  image: '../tilesets/TilesetFloor.png',            w: 352, h: 417 },
  { name: 'water',  image: '../tilesets/TilesetWater.png',            w: 448, h: 272 },
  { name: 'nature', image: '../tilesets/TilesetNature.png',           w: 384, h: 336 },
  { name: 'ruins',  image: '../tilesets/TilesetVillageAbandoned.png', w: 320, h: 192 },
];

// --- floor ---------------------------------------------------------
export const GRASS = 264;
export const GRASS_VAR = [265, 266, 267, 268];
// Tanah di atas rumput: kotak 3x3 + sudut dalam.
export const DIRT = {
  tl: 154, t: 155, tr: 156,
  l: 176,  c: 177, r: 178,
  bl: 198, b: 199, br: 200,
  // sudut dalam: tile tanah dengan rumput hanya di satu pojok diagonal
  inNE: 181, inNW: 182, inSE: 203, inSW: 204,
};
export const DIRT_VAR = [177, 177, 177, 206, 207, 228, 229];

// --- water (danau berpinggir rumput) --------------------------------
export const WATER = {
  tl: 168, t: 169, tr: 170,
  l: 196,  c: 197, r: 198,
  bl: 224, b: 225, br: 226,
};

// --- nature --------------------------------------------------------
// Pohon 2x2: [kiri-atas, kanan-atas, kiri-bawah, kanan-bawah]
export const TREES = [
  [0, 1, 24, 25],
  [16, 17, 40, 41],
  [18, 19, 42, 43],
  [198, 199, 222, 223],
];
export const PINE = [2, 3, 26, 27];
export const BIG_ROCK = [288, 289, 312, 313];
export const BUSHES = [240, 241, 242, 246, 250];
export const ROCKS = [294, 295, 296, 316];
export const STUMP = 196;
export const TUFTS = [243, 244, 245, 247, 248, 249];
export const FLOWERS = [264, 265, 266, 267, 270];

// --- ruins ---------------------------------------------------------
// Reruntuhan gua 4x3 (pintu gelap di baris bawah).
export const RUIN_CAVE = [
  [0, 1, 2, 3],
  [20, 21, 22, 23],
  [40, 41, 42, 43],
];
export const RUIN_PILLAR = [62, 82, 102]; // 1x3
