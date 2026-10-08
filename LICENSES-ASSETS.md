# Lisensi Aset

Setiap aset grafis/suara pihak ketiga wajib dicatat di sini sebelum masuk repo.
Aset yang melarang redistribusi **tidak boleh** masuk selama repo publik.

| Pack | Pembuat | Lisensi | Tautan | Dipakai untuk |
|---|---|---|---|---|
| Tiny Swords (Free Pack + Update 010) | Pixel Frog | Boleh komersial & dimodifikasi; **dilarang redistribusi/jual ulang** | https://pixelfrog-assets.itch.io/tiny-swords | Tileset rumput/pasir/air, pohon, semak, batu, domba, reruntuhan, Warrior, Goblin obor |
| Sheet Knight / Babi Hutan Goblin / Ular Goblin | dari pemilik proyek (dmsandris) | diperlakukan privat seperti Tiny Swords | — | Knight hadap atas/bawah + skill lempar & api; musuh babi & ular. Dipotong & diperkecil oleh `tools/sprites/build_units.py` |

File-nya tidak ada di repo: disimpan di bucket private Supabase Storage `game-assets` dan diunduh saat deploy (`tools/pull-assets.sh`).
