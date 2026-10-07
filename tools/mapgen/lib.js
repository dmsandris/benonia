// Alat bantu pembuat peta: RNG ber-seed, grid, autotile, ekspor Tiled JSON.
import { TILESETS } from './tiles.js';

export const TILE = 16;

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.chance = p => next() < p;
  return next;
}

export class Grid {
  constructor(w, h, fill = 0) { this.w = w; this.h = h; this.a = new Array(w * h).fill(fill); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y, oob = 0) { return this.in(x, y) ? this.a[y * this.w + x] : oob; }
  set(x, y, v) { if (this.in(x, y)) this.a[y * this.w + x] = v; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.a[y * this.w + x]); }
}

// Tileset global id (gid) mengikuti urutan TILESETS, seperti di Tiled.
export function buildTilesets() {
  let firstgid = 1;
  const out = {};
  const json = [];
  for (const t of TILESETS) {
    const columns = Math.floor(t.w / TILE);
    const tilecount = columns * Math.floor(t.h / TILE);
    const fg = firstgid;
    out[t.name] = id => fg + id;
    json.push({
      firstgid, name: t.name, image: t.image, imagewidth: t.w, imageheight: t.h,
      tilewidth: TILE, tileheight: TILE, columns, tilecount, margin: 0, spacing: 0,
    });
    firstgid += tilecount;
  }
  return { gid: out, json };
}

// Autotile untuk area "isi" (tanah/air) di atas rumput.
// mask.get = 1 berarti isi. set = {tl,t,tr,l,c,r,bl,b,br,inNE?,...}
export function autotile(mask, x, y, set, centerPick) {
  const m = (dx, dy) => mask.get(x + dx, y + dy, 1) === 1; // tepi peta dianggap isi
  const n = m(0, -1), s = m(0, 1), e = m(1, 0), w = m(-1, 0);
  if (!n && !w) return set.tl;
  if (!n && !e) return set.tr;
  if (!s && !w) return set.bl;
  if (!s && !e) return set.br;
  if (!n) return set.t;
  if (!s) return set.b;
  if (!w) return set.l;
  if (!e) return set.r;
  if (set.inNE !== undefined) {
    if (!m(1, -1)) return set.inNE;
    if (!m(-1, -1)) return set.inNW;
    if (!m(1, 1)) return set.inSE;
    if (!m(-1, 1)) return set.inSW;
  }
  return centerPick ? centerPick() : set.c;
}

// Buang sel isi yang terlalu tipis (butuh tile "strip" yang tidak kita pakai).
export function cleanThin(mask) {
  for (let changed = true; changed;) {
    changed = false;
    mask.each((x, y, v) => {
      if (v !== 1) return;
      const n = mask.get(x, y - 1, 1), s = mask.get(x, y + 1, 1);
      const e = mask.get(x + 1, y, 1), w = mask.get(x - 1, y, 1);
      if ((!n && !s) || (!e && !w)) { mask.set(x, y, 0); changed = true; }
    });
  }
}

export function toTmj({ w, h, tilesets, layers, objects }) {
  let id = 1;
  const tl = layers.map(l => ({
    id: id++, name: l.name, type: 'tilelayer', x: 0, y: 0, width: w, height: h,
    opacity: 1, visible: l.visible !== false, data: l.grid.a,
  }));
  const og = {
    id: id++, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true,
    draworder: 'topdown',
    objects: objects.map((o, i) => ({
      id: i + 1, name: o.name, type: o.type || '', x: o.x, y: o.y, width: 0, height: 0,
      point: true, rotation: 0, visible: true,
    })),
  };
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal',
    renderorder: 'right-down', width: w, height: h, tilewidth: TILE, tileheight: TILE,
    infinite: false, nextlayerid: id, nextobjectid: objects.length + 1,
    layers: [...tl, og], tilesets,
  };
}
