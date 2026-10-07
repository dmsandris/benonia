// Render peta .tmj (tile + objek) ke PNG untuk dicek tanpa membuka game.
// Pemakaian: node tools/mapgen/preview.js <peta.tmj> <out.png> [--collide]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { SPRITES, WATER_TILE } from '../../web/src/catalog.js';

const [, , mapPath, outPath, flag] = process.argv;
const assets = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'assets');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const T = map.tilewidth;
const img = new PNG({ width: map.width * T, height: map.height * T });
const cache = {};
const load = f => (cache[f] ||= PNG.sync.read(readFileSync(join(assets, f))));

function draw(src, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = dx + x, Y = dy + y;
    if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
    const si = ((sy + y) * src.width + sx + x) * 4, di = (Y * img.width + X) * 4;
    const a = src.data[si + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) img.data[di + c] = src.data[si + c] * a + img.data[di + c] * (1 - a);
    img.data[di + 3] = 255;
  }
}
const sprite = (o, frame = 0) => {
  const s = SPRITES[o.type]; if (!s) return;
  draw(load(s.file), frame * s.fw, 0, s.fw, s.fh, o.x - s.anchor[0], o.y - s.anchor[1]);
};

const water = load(WATER_TILE);
for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) draw(water, 0, 0, T, T, x * T, y * T);
const objs = map.layers.find(l => l.type === 'objectgroup').objects;
objs.filter(o => o.type === 'foam').forEach(o => sprite(o, 6));

const ts = map.tilesets[0], tsImg = load(ts.image.replace(/^\.\.\//, ''));
for (const layer of map.layers) {
  if (layer.type !== 'tilelayer') continue;
  const isCol = layer.name === 'collide';
  if (!layer.visible && !(isCol && flag === '--collide')) continue;
  layer.data.forEach((g, i) => {
    if (!g) return;
    const x = (i % layer.width) * T, y = Math.floor(i / layer.width) * T;
    if (isCol) {
      for (let yy = 0; yy < T; yy += 4) for (let xx = 0; xx < T; xx += 4) {
        const di = ((y + yy) * img.width + x + xx) * 4; img.data[di] = 255; img.data[di + 1] = 0;
      }
      return;
    }
    const id = g - ts.firstgid;
    draw(tsImg, (id % ts.columns) * T, Math.floor(id / ts.columns) * T, T, T, x, y);
  });
}
objs.filter(o => o.type !== 'foam' && o.type !== 'spawn').sort((a, b) => a.y - b.y).forEach(o => sprite(o));
for (const o of objs.filter(o => o.type === 'spawn'))
  for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
    const di = ((o.y + yy) * img.width + o.x + xx) * 4; img.data.set([255, 0, 255, 255], di);
  }
writeFileSync(outPath, PNG.sync.write(img));
console.log(`preview -> ${outPath}`);
