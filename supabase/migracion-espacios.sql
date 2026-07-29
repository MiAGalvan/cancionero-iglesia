-- Migración: separar el cancionero y la lista publicada por parroquia
-- (espacio). Corré esto UNA vez en el SQL Editor de tu proyecto Supabase,
-- por separado de schema.sql (no lo pegues junto con ese archivo — las
-- políticas que ya creaste antes tirarían error de "ya existe" y podrían
-- cortar la ejecución antes de llegar a esto).
--
-- Es seguro correrlo más de una vez por las dudas: "add column if not
-- exists" y "drop constraint if exists" no rompen nada si ya se aplicaron.

-- Todas las canciones y listas que ya tenías cargadas quedan asignadas a
-- 'merced' (la primera parroquia) — después las podés recategorizar a mano
-- si hace falta, tanto desde la app como con un UPDATE acá mismo.
alter table lista_actual add column if not exists space text not null default 'merced';
alter table songs add column if not exists space text not null default 'merced';

-- La lista publicada pasa a ser única por (parroquia, fecha) en vez de solo
-- por fecha: dos parroquias pueden tener misa el mismo día con listas
-- distintas, y no tienen que pisarse entre sí.
alter table lista_actual drop constraint if exists lista_actual_fecha_key;
alter table lista_actual add constraint lista_actual_space_fecha_key unique (space, fecha);
