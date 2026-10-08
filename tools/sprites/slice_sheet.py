"""Potong sprite sheet buatan (latar putih, JPG, tidak berkisi) menjadi frame-frame rapi.

Langkah:
 1. buang latar putih yang tersambung ke tepi gambar (flood fill), bersihkan pinggiran terang
 2. cari baris (pita kosong horizontal) lalu frame di tiap baris (pita kosong vertikal);
    potongan kecil (debu, percikan) digabung ke frame terdekat
 3. tiap frame diskalakan dengan faktor yang sama, disejajarkan pada garis tanah baris itu
    dan titik tengah badan, lalu ditaruh di kanvas seragam

Pemakaian (debug): python3 -I slice_sheet.py debug <sheet.jpg> <out.png>
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def load_rgba(path, white=228):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    near_white = (rgb > white).all(axis=2)
    lab, _ = ndimage.label(near_white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    # pinggiran: piksel terang & pucat yang menempel ke latar dibuang (2 putaran)
    pale = (lum > 200) & (sat < 30)
    for _ in range(2):
        edge = ndimage.binary_dilation(bg) & ~bg & pale
        bg |= edge
    # lubang putih tertutup (celah antar-kaki) = latar juga, kalau dikelilingi garis gelap.
    # Putih yang dikelilingi abu-abu terang (sabetan, kilau) tetap dipertahankan.
    holes, nh = ndimage.label(near_white & ~bg)
    if nh:
        sizes = ndimage.sum(np.ones_like(holes), holes, range(1, nh + 1))
        for i in np.flatnonzero(sizes > 120) + 1:
            h = holes == i
            ring = ndimage.binary_dilation(h, iterations=3) & ~h
            if lum[ring].mean() < 150:
                bg |= h
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=1) | (fg & ~pale)  # buang titik-titik JPG tunggal
    alpha = (fg * 255).astype(np.uint8)
    rgba = np.dstack([rgb.astype(np.uint8), alpha])
    return rgba, fg


def bands(mask_1d, min_gap, min_len=4):
    """Rentang [a,b) di mana mask_1d True, dipisah celah >= min_gap."""
    idx = np.flatnonzero(mask_1d)
    if not len(idx):
        return []
    out, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > min_gap:
            if prev + 1 - start >= min_len:
                out.append([start, prev + 1])
            start = i
        prev = i
    if prev + 1 - start >= min_len:
        out.append([start, prev + 1])
    return out


def segment(fg, row_gap=12, col_gap=6, band_frac=0.25, marker='head', forward='nearest'):
    """Pisah sheet menjadi frame. Kembalikan daftar baris; tiap baris = daftar frame
    {'mask': bool array seukuran sheet (hanya isi frame), 'main': mask badan utama, 'box': (x0,y0,x1,y1)}.

    marker  'head' = penanda frame di 25% teratas pita (tudung), 'feet' = 25% terbawah (kaki/gulungan)
    forward 'right' = efek melayang (api, awan racun) milik karakter di kirinya; 'nearest' = terdekat
    """
    rows = bands(fg.any(axis=1), row_gap, min_len=40)
    out = []
    eight = np.ones((3, 3), bool)
    for (y0, y1) in rows:
        sub = fg[y0:y1]
        H = y1 - y0
        cov = sub.sum(axis=0)
        nb = max(4, int(H * band_frac))
        mrows = slice(0, nb) if marker == 'head' else slice(H - nb, H)
        merge_gap = 10 if marker == 'head' else max(10, int(0.12 * H))
        marks = bands(sub[mrows].any(axis=0), merge_gap, min_len=4)
        lab, n = ndimage.label(sub, structure=np.ones((3, 3), bool))
        if marks:
            med = np.median([b - a for a, b in marks])
            marks = [m for m in marks if m[1] - m[0] >= 0.3 * med]
            # penanda harus milik badan yang tinggi (api/percikan yang jatuh ke bawah bukan penanda)
            # tinggi diukur di kolom penanda itu sendiri (api yang menempel ke badan tetangga tidak lolos)
            def tall(m):
                ids = np.unique(lab[mrows, m[0]:m[1]]); ids = ids[ids > 0]
                rows_hit = np.flatnonzero(np.isin(lab[:, m[0]:m[1]], ids).any(axis=1))
                return len(rows_hit) and (rows_hit[-1] - rows_hit[0]) >= 0.65 * H
            marks = [m for m in marks if tall(m)]
        # garis potong antar-penanda (dipakai hanya untuk komponen yang menempel ke >1 penanda)
        cuts = []
        for m1, m2 in zip(marks, marks[1:]):
            lo, hi = m1[1], m2[0]
            if hi <= lo:
                cuts.append((lo + hi) // 2); continue
            seg = cov[lo:hi]
            zero = bands(seg == 0, 1, min_len=1)
            cuts.append(lo + ((lambda z: (z[0] + z[1]) // 2)(max(zero, key=lambda z: z[1] - z[0])) if zero else int(np.argmin(seg))))
        edges = [0] + cuts + [sub.shape[1]]
        frames = [{'mask': np.zeros_like(sub), 'main': np.zeros_like(sub)} for _ in marks]
        floating = []
        xs_all = np.arange(sub.shape[1])
        for k in range(1, n + 1):
            comp = lab == k
            in_band = comp[mrows].any(axis=0)
            touched = [i for i, (a, b) in enumerate(marks) if in_band[a:b].any()]
            if not touched:
                floating.append(comp); continue
            col_owner = np.searchsorted(edges, xs_all, side='right') - 1
            col_owner = np.clip(col_owner, 0, len(marks) - 1)
            # kolom milik penanda yang tidak disentuh komponen ini -> ke penanda tersentuh terdekat
            fix = np.array([t if t in touched else min(touched, key=lambda q: abs(q - t)) for t in range(len(marks))])
            owner = fix[col_owner]
            for i in touched:
                part = comp & (owner == i)[None, :]
                frames[i]['mask'] |= part
                frames[i]['main'] |= part
        def fbox(f):
            ys, xs = np.nonzero(f['mask'])
            return (xs.min(), xs.max() + 1) if len(xs) else (0, 0)
        min_gap = 0.08 * H
        proj = set()
        for comp in sorted(floating, key=lambda c: -c.sum()):
            ys, xs = np.nonzero(comp)
            a, b = xs.min(), xs.max() + 1
            boxes = [fbox(f) for f in frames]
            gaps = [max(fa - b, a - fb, 0) for fa, fb in boxes]
            big = comp.sum() > 0.04 * H * H
            touching_proj = [i for i in proj if gaps[i] == 0]
            if touching_proj:                       # bagian dari proyektil yang sudah ada (pedang + jejaknya)
                frames[touching_proj[0]]['mask'] |= comp; frames[touching_proj[0]]['main'] |= comp
                continue
            cx = (a + b) / 2
            j = None
            if forward == 'right':                  # efek menyembur ke kanan: milik karakter di kiri bila dekat
                left = [i for i, (fa, fb) in enumerate(boxes) if (fa + fb) / 2 < cx and i not in proj]
                if left:
                    k = min(left, key=lambda i: gaps[i])
                    if gaps[k] < 0.25 * H:
                        j = k
            if j is None and big and (not gaps or min(gaps) >= min_gap):
                frames.append({'mask': comp.copy(), 'main': comp.copy()})   # proyektil berdiri sendiri
                proj.add(len(frames) - 1)
                continue
            if j is None:
                j = int(np.argmin(gaps))
            frames[j]['mask'] |= comp
        row = []
        for f in frames:
            ys, xs = np.nonzero(f['mask'])
            if not len(xs):
                continue
            full = np.zeros_like(fg); full[y0:y1] = f['mask']
            main = np.zeros_like(fg); main[y0:y1] = f['main']
            row.append({'mask': full, 'main': main, 'box': (xs.min(), y0 + ys.min(), xs.max() + 1, y0 + ys.max() + 1)})
        row.sort(key=lambda f: f['box'][0])
        out.append(row)
    return out


def body_anchor(frame):
    """Titik tengah badan: pusat massa badan utama di bagian tengah-tinggi (tanpa api/debu), dan dasar badan."""
    ys, xs = np.nonzero(frame['main'])
    top, bot = ys.min(), ys.max()
    h = bot - top + 1
    band = (ys >= top + 0.3 * h) & (ys <= top + 0.85 * h)
    cx = xs[band].mean() if band.any() else xs.mean()
    return cx, bot + 1


def debug(path, out, marker='head', forward='nearest'):
    rgba, fg = load_rgba(path)
    rows = segment(fg, marker=marker, forward=forward)
    im = Image.new('RGBA', (rgba.shape[1], rgba.shape[0]), (60, 140, 160, 255))
    tint = [(255, 80, 80), (80, 255, 80), (80, 160, 255), (255, 220, 60)]
    for r, frames in enumerate(rows):
        for c, f in enumerate(frames):
            layer = rgba.copy(); layer[..., 3] = np.where(f['mask'], 255, 0)
            im.alpha_composite(Image.fromarray(layer, 'RGBA'))
            col = np.zeros_like(rgba); col[..., :3] = tint[c % 4]; col[..., 3] = np.where(f['mask'] & ~f['main'], 90, 0)
            im.alpha_composite(Image.fromarray(col, 'RGBA'))
    d = ImageDraw.Draw(im)
    for r, frames in enumerate(rows):
        for c, f in enumerate(frames):
            x0, y0, x1, y1 = f['box']
            d.rectangle([x0, y0, x1, y1], outline=tint[c % 4], width=3)
            ax, ay = body_anchor(f)
            d.ellipse([ax - 6, ay - 6, ax + 6, ay + 6], fill=(255, 255, 0))
            d.rectangle([x0, y0, x0 + 46, y0 + 24], fill=(0, 0, 0))
            d.text((x0 + 4, y0 + 4), f'{r}.{c}', fill=(255, 255, 0))
    im.convert('RGB').save(out)
    for r, frames in enumerate(rows):
        print(r, [(int(f['box'][2] - f['box'][0]), int(f['box'][3] - f['box'][1])) for f in frames])


if __name__ == '__main__':
    if sys.argv[1] == 'debug':
        debug(sys.argv[2], sys.argv[3], *(sys.argv[4:6]))
