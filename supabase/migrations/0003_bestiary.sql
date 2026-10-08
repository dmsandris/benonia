-- 0003_bestiary — musuh baru: Babi Hutan Goblin & Ular Goblin, beserta barang jatuhannya.
-- Aman diulang (upsert).

insert into game.item_catalog (item_id, name, kind, icon, info) values
  ('taring_babi',  'Taring Babi',  'material', '🦷', 'Taring melengkung. Dicari pandai besi.'),
  ('daging_babi',  'Daging Babi Hutan', 'material', '🥩', 'Daging liat. Bisa dijual atau dimasak.'),
  ('sisik_ular',   'Sisik Ular',   'material', '🐍', 'Sisik hijau berkilau. Bahan zirah ringan.'),
  ('kantung_bisa', 'Kantung Bisa', 'material', '🧪', 'Bisa ular. Bahan ramuan penawar.')
on conflict (item_id) do update set name = excluded.name, kind = excluded.kind, icon = excluded.icon, info = excluded.info;

insert into game.enemy_catalog (enemy_id, name, exp, zeny_min, zeny_max, respawn_s) values
  ('hog',   'Babi Hutan Goblin', 30, 6, 14, 35),
  ('snake', 'Ular Goblin',       22, 4, 10, 30)
on conflict (enemy_id) do update set name = excluded.name, exp = excluded.exp,
  zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, respawn_s = excluded.respawn_s;

insert into game.drop_table (enemy_id, item_id, chance, qty_min, qty_max) values
  ('hog',   'taring_babi',    0.50, 1, 2),
  ('hog',   'daging_babi',    0.45, 1, 1),
  ('hog',   'stone_of_dunex', 0.06, 1, 1),
  ('snake', 'sisik_ular',     0.55, 1, 3),
  ('snake', 'kantung_bisa',   0.30, 1, 1),
  ('snake', 'stone_of_dunex', 0.04, 1, 1)
on conflict (enemy_id, item_id) do update set chance = excluded.chance,
  qty_min = excluded.qty_min, qty_max = excluded.qty_max;
