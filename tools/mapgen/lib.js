// Alat bantu pembuat peta: RNG ber-seed, grid, autotile, ekspor Tiled JSON.

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
  clone() { const g = new Grid(this.w, this.h); g.a = [...this.a]; return g; }
}

// Autotile 16 kasus (tetangga atas/bawah/kiri/kanan) untuk tileset gaya Tiny Swords:
// kotak 3x3 + strip vertikal + strip horizontal + tile tunggal.
// base = id kiri-atas blok di tileset (rumput 0, pasir 5), cols = kolom tileset.
export function autotile16(mask, x, y, base, cols) {
  const m = (dx, dy) => mask.get(x + dx, y + dy, 0) === 1;
  const n = m(0, -1), s = m(0, 1), w = m(-1, 0), e = m(1, 0);
  const at = (c, r) => base + r * cols + c;
  if (n && s && w && e) return at(1, 1);
  if (!n && s && w && e) return at(1, 0);
  if (n && !s && w && e) return at(1, 2);
  if (n && s && !w && e) return at(0, 1);
  if (n && s && w && !e) return at(2, 1);
  if (!n && s && !w && e) return at(0, 0);
  if (!n && s && w && !e) return at(2, 0);
  if (n && !s && !w && e) return at(0, 2);
  if (n && !s && w && !e) return at(2, 2);
  // strip vertikal (kolom 3) dan horizontal (baris 3)
  if (!w && !e) return at(3, n && s ? 1 : s ? 0 : n ? 2 : 3);
  if (!n && !s) return at(w && e ? 1 : e ? 0 : 2, 3);
  return at(1, 1);
}

// Buang sel yang hanya tersambung diagonal / tipis 1 sel (tidak ada tile-nya yang cantik).
export function cleanThin(mask) {
  for (let changed = true; changed;) {
    changed = false;
    mask.each((x, y, v) => {
      if (v !== 1) return;
      const n = mask.get(x, y - 1), s = mask.get(x, y + 1), e = mask.get(x + 1, y), w = mask.get(x - 1, y);
      if ((!n && !s) || (!e && !w)) { mask.set(x, y, 0); changed = true; }
    });
  }
}

export function toTmj({ w, h, tile, tilesets, layers, objects }) {
  let id = 1;
  const tl = layers.map(l => ({
    id: id++, name: l.name, type: 'tilelayer', x: 0, y: 0, width: w, height: h,
    opacity: 1, visible: l.visible !== false, data: l.grid.a,
  }));
  const og = {
    id: id++, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true,
    draworder: 'topdown',
    objects: objects.map((o, i) => ({
      id: i + 1, name: o.name || '', type: o.type || '', x: Math.round(o.x), y: Math.round(o.y),
      width: 0, height: 0, point: true, rotation: 0, visible: true,
    })),
  };
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal',
    renderorder: 'right-down', width: w, height: h, tilewidth: tile, tileheight: tile,
    infinite: false, nextlayerid: id, nextobjectid: objects.length + 1,
    layers: [...tl, og], tilesets,
  };
}
