-- 0001_foundation — schema inti, keamanan, helper, api_ping.
-- ATURAN: setiap file migrasi wajib aman diulang (idempotent).
-- deploy-db menjalankan ulang SEMUA file dari awal dalam satu transaksi.

create schema if not exists game;
revoke all on schema game from public;
revoke all on schema game from anon, authenticated;

-- ---------------------------------------------------------------
-- Konfigurasi yang bisa diubah tanpa mengubah kode.
-- ---------------------------------------------------------------
create table if not exists game.config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on game.config from public;

insert into game.config (key, value) values
  ('WorldName',      '"Benonia"'),
  ('SchemaVersion',  '1')
on conflict (key) do nothing;

create or replace function game.cfg(k text) returns jsonb
language sql stable set search_path = game, public as $$
  select value from game.config where key = k
$$;

-- ---------------------------------------------------------------
-- Helper argumen: semua api_* menerima a jsonb berbentuk array.
-- ---------------------------------------------------------------
create or replace function game.arg(a jsonb, i int) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(a) = 'array' then a -> i else null end
$$;

create or replace function game.arg_text(a jsonb, i int) returns text
language sql immutable as $$ select game.arg(a, i) #>> '{}' $$;

create or replace function game.arg_int(a jsonb, i int) returns int
language sql immutable as $$ select (game.arg(a, i) #>> '{}')::int $$;

-- ---------------------------------------------------------------
-- Pemain dari sesi login. Klien tidak pernah mengirim id pemain.
-- ---------------------------------------------------------------
create or replace function game.me() returns uuid
language plpgsql stable set search_path = game, public as $$
declare uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Silakan login dulu.' using errcode = '28000';
  end if;
  return uid;
end $$;

-- ---------------------------------------------------------------
-- Pintu masuk: hanya fungsi public.api_*(jsonb) yang boleh dipanggil.
-- expose        -> hanya pemain yang sudah login
-- expose_public -> juga tamu (anon), mis. ping & cek username
-- ---------------------------------------------------------------
create or replace function game.expose(fn text) returns void
language plpgsql set search_path = game, public as $$
begin
  execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated', fn);
  execute format('grant execute on function public.%I(jsonb) to authenticated', fn);
end $$;

create or replace function game.expose_public(fn text) returns void
language plpgsql set search_path = game, public as $$
begin
  execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated', fn);
  execute format('grant execute on function public.%I(jsonb) to anon, authenticated', fn);
end $$;

-- ---------------------------------------------------------------
-- api_ping: cek koneksi dari layar M0.
-- ---------------------------------------------------------------
create or replace function public.api_ping(a jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = game, public as $$
begin
  return jsonb_build_object(
    'ok', true,
    'world', game.cfg('WorldName') #>> '{}',
    'schema', (game.cfg('SchemaVersion') #>> '{}')::int,
    'serverTime', (extract(epoch from now()) * 1000)::bigint
  );
end $$;
select game.expose_public('api_ping');
