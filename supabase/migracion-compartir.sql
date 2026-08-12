-- Migración: permite marcar canciones como "compartidas" para que otras
-- parroquias las vean y las copien a su propio cancionero, en vez de
-- tipearlas de nuevo desde cero.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase, por separado
-- de los demás archivos .sql. Es seguro correrlo más de una vez.

alter table songs add column if not exists space_name text;
alter table songs add column if not exists shared boolean not null default false;

-- Además de leer el cancionero propio (política ya existente "equipo
-- autorizado lee el cancionero"), cualquier persona del equipo logueada
-- (de cualquier parroquia) puede leer las canciones que OTRAS parroquias
-- marcaron como compartidas. Postgres combina las políticas de SELECT con
-- "o", así que esto no le quita acceso a nada de lo que ya tenía.
drop policy if exists "equipo lee canciones compartidas de otras parroquias" on songs;
create policy "equipo lee canciones compartidas de otras parroquias"
  on songs for select to authenticated
  using (shared = true);
