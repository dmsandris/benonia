-- 0002_progress — pemain, progres, EXP/level, inventory, klaim kill + drop.
-- Server yang menentukan EXP & drop. Klien hanya melapor "saya mengalahkan musuh X
-- di titik muncul Y"; server memeriksa batas wajar lalu melempar dadu drop sendiri.

-- ---------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------
create table if not exists game.players (
  id         uuid primary key,              -- = auth.users.id
  username   text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists game.player_state (
  player_id  uuid primary key references game.players(id) on delete cascade,
  level      int not null default 1,
  exp        int not null default 0,
  hp         int not null default 100,
  mp         int not null default 60,
  zeny       int not null default 0,
  kills      int not null default 0,
  map        text not null default 'island',
  x          int,
  y          int,
  saved_at   timestamptz not null default now()
);

create table if not exists game.item_catalog (
  item_id text primary key,
  name    text not null,
  kind    text not null,          -- material | consumable | key
  icon    text not null default '•',
  info    text not null default ''
);

create table if not exists game.inventory (
  player_id uuid references game.players(id) on delete cascade,
  item_id   text references game.item_catalog(item_id),
  qty       int not null check (qty >= 0),
  primary key (player_id, item_id)
);

create table if not exists game.enemy_catalog (
  enemy_id text primary key,
  name     text not null,
  exp      int not null,
  zeny_min int not null default 0,
  zeny_max int not null default 0,
  respawn_s int not null default 20
);

create table if not exists game.drop_table (
  enemy_id text references game.enemy_catalog(enemy_id),
  item_id  text references game.item_catalog(item_id),
  chance   numeric not null,      -- 0..1
  qty_min  int not null default 1,
  qty_max  int not null default 1,
  primary key (enemy_id, item_id)
);

create table if not exists game.kill_log (
  player_id uuid references game.players(id) on delete cascade,
  spawn_id  text not null,
  enemy_id  text not null,
  killed_at timestamptz not null default now()
);
create index if not exists kill_log_recent on game.kill_log (player_id, killed_at desc);

revoke all on game.players, game.player_state, game.item_catalog, game.inventory,
  game.enemy_catalog, game.drop_table, game.kill_log from public;

-- ---------------------------------------------------------------
-- Data katalog (diulang setiap deploy: upsert)
-- ---------------------------------------------------------------
insert into game.item_catalog (item_id, name, kind, icon, info) values
  ('kain_goblin',    'Kain Goblin',     'material',   '🧵', 'Kain kumal. Laku dijual ke pedagang.'),
  ('obor_patah',     'Obor Patah',      'material',   '🔥', 'Masih hangat. Bahan kerajinan.'),
  ('stone_of_dunex', 'Stone of Dunex',  'key',        '💎', 'Batu langka untuk pulang ke Tiny World.')
on conflict (item_id) do update set name = excluded.name, kind = excluded.kind, icon = excluded.icon, info = excluded.info;

insert into game.enemy_catalog (enemy_id, name, exp, zeny_min, zeny_max, respawn_s) values
  ('goblin', 'Goblin Obor', 12, 2, 6, 20)
on conflict (enemy_id) do update set name = excluded.name, exp = excluded.exp,
  zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, respawn_s = excluded.respawn_s;

insert into game.drop_table (enemy_id, item_id, chance, qty_min, qty_max) values
  ('goblin', 'kain_goblin',    0.55, 1, 2),
  ('goblin', 'obor_patah',     0.25, 1, 1),
  ('goblin', 'stone_of_dunex', 0.03, 1, 1)
on conflict (enemy_id, item_id) do update set chance = excluded.chance,
  qty_min = excluded.qty_min, qty_max = excluded.qty_max;

insert into game.config (key, value) values
  ('MaxKillsPerMinute', '24'),     -- batas wajar (goblin mati min. ~2,5 dtk sekali)
  ('MaxMoveSpeedPx',    '420'),    -- lebih cepat dari ini = posisi ditolak
  ('MapBounds',         '{"island":[2560,1792]}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- Rumus level (dipakai server & dikirim ke klien)
-- ---------------------------------------------------------------
create or replace function game.exp_next(lvl int) returns int
language sql immutable as $$ select 20 + 10 * lvl * lvl $$;   -- L1:30, L2:60, L3:110, ...

create or replace function game.max_hp(lvl int) returns int
language sql immutable as $$ select 100 + 10 * (lvl - 1) $$;

create or replace function game.max_mp(lvl int) returns int
language sql immutable as $$ select 60 + 5 * (lvl - 1) $$;

create or replace function game.username_ok(u text) returns boolean
language sql immutable as $$ select u ~ '^[a-z0-9_]{3,16}$' $$;

-- State lengkap pemain dalam satu objek JSON.
create or replace function game.state_json(pid uuid) returns jsonb
language sql stable set search_path = game, public as $$
  select jsonb_build_object(
    'username', p.username,
    'level', s.level, 'exp', s.exp, 'expNext', game.exp_next(s.level),
    'hp', s.hp, 'maxHp', game.max_hp(s.level),
    'mp', s.mp, 'maxMp', game.max_mp(s.level),
    'zeny', s.zeny, 'kills', s.kills, 'map', s.map, 'x', s.x, 'y', s.y,
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.item_id, 'name', c.name, 'icon', c.icon,
                                          'kind', c.kind, 'info', c.info, 'qty', i.qty) order by c.kind, c.name)
      from game.inventory i join game.item_catalog c using (item_id)
      where i.player_id = pid and i.qty > 0), '[]'::jsonb)
  )
  from game.players p join game.player_state s on s.player_id = p.id
  where p.id = pid
$$;

-- ---------------------------------------------------------------
-- API
-- ---------------------------------------------------------------

-- Cek nama sebelum daftar (tamu boleh memanggil).
create or replace function public.api_checkUsername(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
declare u text := lower(trim(coalesce(game.arg_text(a, 0), '')));
begin
  if not game.username_ok(u) then
    return jsonb_build_object('ok', false, 'reason', 'Nama 3–16 huruf kecil, angka, atau _');
  end if;
  if exists (select 1 from game.players where username = u) then
    return jsonb_build_object('ok', false, 'reason', 'Nama sudah dipakai');
  end if;
  return jsonb_build_object('ok', true);
end $$;
select game.expose_public('api_checkusername');

-- Buat karakter untuk akun yang sedang login (sekali saja).
create or replace function public.api_createCharacter(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
declare
  pid uuid := game.me();
  u text := lower(trim(coalesce(game.arg_text(a, 0), '')));
begin
  if exists (select 1 from game.players where id = pid) then
    return game.state_json(pid);
  end if;
  if not game.username_ok(u) then raise exception 'Nama 3–16 huruf kecil, angka, atau _'; end if;
  if exists (select 1 from game.players where username = u) then raise exception 'Nama sudah dipakai'; end if;
  insert into game.players (id, username) values (pid, u);
  insert into game.player_state (player_id) values (pid);
  return game.state_json(pid);
end $$;
select game.expose('api_createcharacter');

-- Ambil state; null kalau akun belum punya karakter.
create or replace function public.api_getState(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
begin
  return game.state_json(game.me());
end $$;
select game.expose('api_getstate');

-- Simpan posisi/HP/MP. Posisi yang mustahil (terlalu jauh dari simpanan terakhir) diabaikan.
create or replace function public.api_saveProgress(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
declare
  pid uuid := game.me();
  s game.player_state;
  nx int := game.arg_int(a, 0);
  ny int := game.arg_int(a, 1);
  nhp int := game.arg_int(a, 2);
  nmp int := game.arg_int(a, 3);
  bounds jsonb := game.cfg('MapBounds') -> 'island';
  maxv numeric := (game.cfg('MaxMoveSpeedPx') #>> '{}')::numeric;
  secs numeric;
  pos_ok boolean := true;
begin
  select * into s from game.player_state where player_id = pid for update;
  if not found then raise exception 'Karakter belum dibuat'; end if;
  if nx is null or ny is null or nx < 0 or ny < 0
     or nx > (bounds ->> 0)::int or ny > (bounds ->> 1)::int then
    pos_ok := false;
  elsif s.x is not null then
    secs := greatest(extract(epoch from now() - s.saved_at), 0.5);
    -- +500px toleransi: bangkit di titik awal / lag jaringan
    pos_ok := sqrt(power(nx - s.x, 2) + power(ny - s.y, 2)) <= maxv * secs + 500;
  end if;
  update game.player_state set
    x = case when pos_ok then nx else x end,
    y = case when pos_ok then ny else y end,
    hp = least(greatest(coalesce(nhp, hp), 1), game.max_hp(level)),
    mp = least(greatest(coalesce(nmp, mp), 0), game.max_mp(level)),
    saved_at = now()
  where player_id = pid;
  return jsonb_build_object('ok', true, 'positionAccepted', pos_ok);
end $$;
select game.expose('api_saveprogress');

-- Lapor kill. Server memeriksa batas wajar, memberi EXP & Zeny, dan melempar drop.
create or replace function public.api_claimKill(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
declare
  pid uuid := game.me();
  spawn text := coalesce(game.arg_text(a, 0), '');
  eid text := coalesce(game.arg_text(a, 1), '');
  e game.enemy_catalog;
  s game.player_state;
  per_min int := (game.cfg('MaxKillsPerMinute') #>> '{}')::int;
  recent int;
  v_zeny int;
  drops jsonb := '[]';
  d record;
  q int;
  lvl_up boolean := false;
begin
  select * into e from game.enemy_catalog where enemy_id = eid;
  if not found then raise exception 'Musuh tidak dikenal'; end if;
  if spawn !~ '^[a-z]+:[0-9]+$' then raise exception 'Titik muncul tidak sah'; end if;
  if split_part(spawn, ':', 1) <> eid then raise exception 'Titik muncul bukan milik musuh ini'; end if;

  select * into s from game.player_state where player_id = pid for update;
  if not found then raise exception 'Karakter belum dibuat'; end if;

  -- musuh yang sama tidak bisa dikalahkan lagi sebelum waktu muncul ulangnya
  if exists (select 1 from game.kill_log where player_id = pid and spawn_id = spawn
             and killed_at > now() - make_interval(secs => e.respawn_s - 3)) then
    return jsonb_build_object('ok', false, 'reason', 'respawn');
  end if;
  select count(*) into recent from game.kill_log
   where player_id = pid and killed_at > now() - interval '1 minute';
  if recent >= per_min then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  insert into game.kill_log (player_id, spawn_id, enemy_id) values (pid, spawn, eid);
  delete from game.kill_log where player_id = pid and killed_at < now() - interval '10 minutes';

  v_zeny := e.zeny_min + floor(random() * (e.zeny_max - e.zeny_min + 1))::int;

  for d in select * from game.drop_table where enemy_id = eid loop
    if random() < d.chance then
      q := d.qty_min + floor(random() * (d.qty_max - d.qty_min + 1))::int;
      insert into game.inventory (player_id, item_id, qty) values (pid, d.item_id, q)
        on conflict (player_id, item_id) do update set qty = game.inventory.qty + excluded.qty;
      drops := drops || jsonb_build_object('id', d.item_id, 'qty', q,
        'name', (select name from game.item_catalog where item_id = d.item_id),
        'icon', (select icon from game.item_catalog where item_id = d.item_id));
    end if;
  end loop;

  s.exp := s.exp + e.exp;
  while s.exp >= game.exp_next(s.level) loop
    s.exp := s.exp - game.exp_next(s.level);
    s.level := s.level + 1;
    lvl_up := true;
  end loop;

  update game.player_state set
    exp = s.exp, level = s.level, zeny = zeny + v_zeny, kills = kills + 1,
    hp = case when lvl_up then game.max_hp(s.level) else hp end,
    mp = case when lvl_up then game.max_mp(s.level) else mp end
  where player_id = pid;

  return jsonb_build_object('ok', true, 'exp', e.exp, 'zeny', v_zeny, 'drops', drops,
                            'levelUp', lvl_up, 'state', game.state_json(pid));
end $$;
select game.expose('api_claimkill');

-- Pemain tumbang: EXP level saat ini kembali ke 0 (sesuai PRD), HP penuh di titik awal.
create or replace function public.api_playerDied(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
declare pid uuid := game.me();
begin
  update game.player_state set exp = 0, hp = game.max_hp(level), mp = game.max_mp(level),
    x = null, y = null, saved_at = now()
  where player_id = pid;
  return game.state_json(pid);
end $$;
select game.expose('api_playerdied');
