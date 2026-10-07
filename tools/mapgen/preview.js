// Render peta .tmj ke PNG untuk dicek tanpa membuka game.
// Pemakaian: node tools/mapgen/preview.js web/public/assets/maps/forest.tmj out.png [--collide]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

const [, , mapPath, outPath, flag] = process.argv;
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const T = map.tilewidth;
const img = new PNG({ width: map.width * T, height: map.height * T });

const sets = map.tilesets.map(ts => ({
  ...ts, png: PNG.sync.read(readFileSync(resolve(dirname(mapPath), ts.image))),
})).sort((a, b) => a.firstgid - b.firstgid);
const setOf = g => sets.filter(s => s.firstgid <= g).at(-1);

function blit(g, dx, dy) {
  const s = setOf(g); const id = g - s.firstgid;
  const sx = (id % s.columns) * T, sy = Math.floor(id / s.columns) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const si = ((sy + y) * s.png.width + sx + x) * 4, di = ((dy + y) * img.width + dx + x) * 4;
    const a = s.png.data[si + 3] / 255;
    if (!a) continue;
    for (let c = 0; c < 3; c++) img.data[di + c] = s.png.data[si + c] * a + img.data[di + c] * (1 - a);
    img.data[di + 3] = 255;
  }
}

for (const layer of map.layers) {
  if (layer.type !== 'tilelayer') continue;
  const show = layer.visible || (flag === '--collide' && layer.name === 'collide');
  if (!show) continue;
  layer.data.forEach((g, i) => {
    if (!g) return;
    const x = (i % layer.width) * T, y = Math.floor(i / layer.width) * T;
    if (layer.name === 'collide') {
      for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) {
        const di = ((y + yy) * img.width + x + xx) * 4;
        img.data[di] = Math.min(255, img.data[di] + 90);
      }
    } else blit(g, x, y);
  });
}
for (const l of map.layers) if (l.type === 'objectgroup') for (const o of l.objects) {
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
    const di = ((Math.round(o.y) + yy) * img.width + Math.round(o.x) + xx) * 4;
    img.data[di] = 255; img.data[di + 1] = 0; img.data[di + 2] = 255; img.data[di + 3] = 255;
  }
}
writeFileSync(outPath, PNG.sync.write(img));
console.log(`preview -> ${outPath}`);
