-- Migración: crear la tabla "songs" (si todavía no existe) y separar el
-- cancionero + la lista publicada por parroquia (espacio). Corré esto UNA
-- vez en el SQL Editor de tu proyecto Supabase, por separado de schema.sql
-- (no lo pegues junto con ese archivo — las políticas de lista_actual que
-- ya creaste antes tirarían error de "ya existe" y podrían cortar la
-- ejecución antes de llegar a esto).
--
-- Es seguro correrlo más de una vez por las dudas: todo acá usa "if not
-- exists" / "if exists", no rompe nada si ya se aplicó parte de esto.

-- 1. Tabla privada "songs" (cancionero completo, con acordes), por si
-- todavía no se había creado. Ya incluye la columna "space" desde el
-- principio, así que no hace falta agregarla después con un alter table.
create table if not exists songs (
  uuid text primary key,
  space text not null default 'merced',
  title text not null,
  artist text not null default '',
  categories jsonb not null default '[]',
  chordpro text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table songs enable row level security;

drop policy if exists "equipo lee el cancionero" on songs;
create policy "equipo lee el cancionero"
  on songs for select to authenticated using (true);

drop policy if exists "equipo agrega canciones" on songs;
create policy "equipo agrega canciones"
  on songs for insert to authenticated with check (true);

drop policy if exists "equipo actualiza canciones" on songs;
create policy "equipo actualiza canciones"
  on songs for update to authenticated using (true) with check (true);

-- 2. La tabla "lista_actual" (pública, sin acordes) ya existía: acá le
-- agregamos la columna "space". Todo lo que ya tenías cargado queda
-- asignado a 'merced' (la primera parroquia) — después lo podés
-- recategorizar a mano si hace falta, tanto desde la app como con un
-- UPDATE acá mismo.
alter table lista_actual add column if not exists space text not null default 'merced';

-- La lista publicada pasa a ser única por (parroquia, fecha) en vez de solo
-- por fecha: dos parroquias pueden tener misa el mismo día con listas
-- distintas, y no tienen que pisarse entre sí.
alter table lista_actual drop constraint if exists lista_actual_fecha_key;
alter table lista_actual drop constraint if exists lista_actual_space_fecha_key;
alter table lista_actual add constraint lista_actual_space_fecha_key unique (space, fecha);
