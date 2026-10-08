"""Bangun sprite strip final untuk knight (pemain), hog & snake (musuh) dari sheet sumber.

Pemakaian:
  python3 -I build_units.py <hog.jpg> <snake.jpg> <knight.jpg> <folder aset ts/> <web/src/unitsheets.js>

Sumber gambar & hasil PNG tidak masuk repo (aset privat, diunggah lewat paket Supabase).
"""
import json, math, sys
import numpy as np
from scipy import ndimage
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from slice_sheet import load_rgba, segment, body_anchor

# tinggi target (px) dibandingkan Warrior Tiny Swords (badan ±89px)
SPEC = {
    'knight': dict(marker='feet', forward='right', target_h=97, ref_row=3, anims={
        'walkDown': (3, [0, 1, 2, 3, 4, 5, 6], 10, -1),
        'walkUp': (2, [0, 1, 2, 3, 4, 5, 6], 10, -1),
        'throwShield': (0, [0, 1, 2, 3], 14, 0),
        'noShield': (0, [5, 6], 4, -1),
        'throwSword': (1, [0, 1, 2, 3], 14, 0),
        'noSword': (1, [5, 6], 4, -1),
        'fire': (4, [1, 2, 3], 9, 0),
    }, projectiles={'shieldSpin': (0, 4), 'swordFly': (1, 4)}),
    'hog': dict(marker='head', forward='nearest', target_h=122, ref_row=0, anims={
        'idle': (0, [0, 1, 2, 3, 4, 5, 6], 8, -1),
        'run': (1, [0, 1, 2, 3, 4, 5], 12, -1),
        'swipe': (2, [0, 1, 2, 3, 4, 5], 12, 0),
        'charge': (3, [0, 1, 2, 3, 4, 5], 12, 0),
        'spin': (4, [0, 1, 2, 3, 4, 5], 12, 0),
    }),
    'snake': dict(marker='feet', forward='right', target_h=84, ref_row=0, anims={
        'idle': (0, [0, 1, 2, 3, 4, 5, 6], 8, -1),
        'move': (1, [0, 1, 2, 3, 4, 5], 10, -1),
        'spit': (2, [0, 1, 2, 3, 4, 5], 10, 0),
        'bite': (3, [0, 1, 2, 3, 4, 5], 12, 0),
        'vanish': (4, [3, 4, 5], 10, 0),
    }, clouds={'poison': (2, 5)}),
}


def downscale(rgba, mask, box, k):
    """Perkecil potongan dengan rata-rata berbobot alfa (tanpa pinggiran putih), alfa dibulatkan."""
    x0, y0, x1, y1 = box
    a = mask[y0:y1, x0:x1].astype(np.float32)
    rgb = rgba[y0:y1, x0:x1, :3].astype(np.float32) * a[..., None]
    w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
    def rs(ch):
        return np.asarray(Image.fromarray(ch, 'F').resize((w, h), Image.BOX))
    A = rs(a)
    out = np.zeros((h, w, 4), np.uint8)
    safe = np.maximum(A, 1e-6)
    for c in range(3):
        out[..., c] = np.clip(rs(rgb[..., c].copy()) / safe, 0, 255)
    out[..., 3] = np.where(A >= 0.5, 255, 0)
    return out


def build(name, path, spec, outdir):
    rgba, fg = load_rgba(path)
    rows = segment(fg, marker=spec['marker'], forward=spec['forward'])
    # skala dari tinggi badan rata-rata di baris acuan
    ref = [f['box'][3] - f['box'][1] for f in rows[spec['ref_row']]]
    k = spec['target_h'] / float(np.median(ref))
    used = []
    for key, (r, idx, fps, rep) in spec['anims'].items():
        ground = float(np.median([body_anchor(f)[1] for f in rows[r]]))
        for i in idx:
            f = rows[r][i]
            ax, _ = body_anchor(f)
            used.append((key, f, ax, ground))
    # kanvas seragam untuk semua animasi karakter ini
    L = max((ax - f['box'][0]) * k for _, f, ax, g in used)
    R = max((f['box'][2] - ax) * k for _, f, ax, g in used)
    U = max((g - f['box'][1]) * k for _, f, ax, g in used)
    D = max((f['box'][3] - g) * k for _, f, ax, g in used)
    fw = int(math.ceil(L + R)) + 4; fw += fw % 2
    fh = int(math.ceil(U + D)) + 4; fh += fh % 2
    axc, ayc = int(math.ceil(L)) + 2, int(math.ceil(U)) + 2
    meta = {'fw': fw, 'fh': fh, 'anchor': [axc, ayc], 'anims': {}}
    for key, (r, idx, fps, rep) in spec['anims'].items():
        strip = Image.new('RGBA', (fw * len(idx), fh), (0, 0, 0, 0))
        for n, (kk, f, ax, g) in enumerate([u for u in used if u[0] == key]):
            img = downscale(rgba, f['mask'], f['box'], k)
            px = round(axc - (ax - f['box'][0]) * k)
            py = round(ayc - (g - f['box'][1]) * k)
            strip.alpha_composite(Image.fromarray(img, 'RGBA'), (n * fw + max(px, 0), max(py, 0)))
        file = f'ts/units/{name}-{key}.png'
        strip.save(f'{outdir}/units/{name}-{key}.png')
        meta['anims'][key] = {'file': file, 'frames': len(idx), 'fps': fps, 'repeat': rep}
    # proyektil & awan: satu gambar, titik tengah = pusat
    extra = {}
    for key, (r, i) in {**spec.get('projectiles', {}), **spec.get('clouds', {})}.items():
        f = rows[r][i]
        if key in spec.get('projectiles', {}):
            m = f['mask']
        else:  # awan: piksel hijau terang di frame itu, gumpalan terbesar
            px = rgba[..., :3].astype(int)
            green = f['mask'] & (px[..., 1] > px[..., 0] + 25) & (px[..., 1] > px[..., 2] + 25) & (px.mean(axis=2) > 110)
            grown = ndimage.binary_closing(green, iterations=3)
            lab, n = ndimage.label(grown)
            sizes = ndimage.sum(grown, lab, range(1, n + 1))
            m = (lab == int(np.argmax(sizes)) + 1) & f['mask']
        ys, xs = np.nonzero(m)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        img = Image.fromarray(downscale(rgba, m, box, k), 'RGBA')
        img.save(f'{outdir}/units/{name}-{key}.png')
        extra[key] = {'file': f'ts/units/{name}-{key}.png', 'w': img.width, 'h': img.height}
    meta['extra'] = extra
    print(name, 'scale', round(k, 3), 'frame', fw, 'x', fh, 'anchor', meta['anchor'])
    return meta


if __name__ == '__main__':
    hog, snake, knight, outdir, js = sys.argv[1:6]
    metas = {
        'knight': build('knight', knight, SPEC['knight'], outdir),
        'hog': build('hog', hog, SPEC['hog'], outdir),
        'snake': build('snake', snake, SPEC['snake'], outdir),
    }
    with open(js, 'w') as fh:
        fh.write('// DIBUAT OTOMATIS oleh tools/sprites/build_units.py, jangan diedit tangan.\n')
        fh.write('// Ukuran frame, titik jangkar (kaki), dan animasi sprite knight/hog/snake.\n')
        fh.write('export const UNIT_SHEETS = ' + json.dumps(metas, indent=2) + ';\n')
