# Benonia

2D top-down action RPG berbasis browser. Phaser 4 + Supabase + GitHub Pages.

Live: https://dmsandris.github.io/benonia/

## Struktur

```
web/                  frontend (Vite + Phaser 4)
  src/scenes/         scene Phaser
  src/net/            klien Supabase, pemanggil api_*
  src/config.js       URL + publishable key Supabase (aman publik)
  public/assets/      sprite, tileset, audio, peta (.tmj)
maps/                 skrip pembuat peta + JSON hasilnya
supabase/migrations/  seluruh logika server (SQL, idempotent, urut nama)
test/                 tes per migrasi (PGlite)
tools/                harness tes, test-all, combine-sql
.github/workflows/    deploy-web (Pages), deploy-db (migrasi)
```

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm install` | pasang dependensi |
| `npm run dev` | server lokal http://localhost:8787/benonia/ |
| `npm test` | semua tes PGlite (wajib lulus sebelum deploy-db) |
| `npm run build` | build ke `dist/` |

## Aturan server (sama seperti Marantau)

- Klien hanya memanggil `public.api_*(a jsonb)`; argumen selalu array.
- Pemain diambil dari sesi (`game.me()`), tidak pernah dikirim klien.
- Setiap fungsi baru: `select game.expose('api_x')` (login) atau `game.expose_public` (tamu).
- Schema `game` tertutup untuk publik.
- Migrasi wajib idempotent: deploy menjalankan ulang semua file setiap kali.

## Rahasia

`SUPABASE_DB_URL` (Session pooler URI) hanya di GitHub Secrets. Jangan pernah commit password database atau service_role key.
