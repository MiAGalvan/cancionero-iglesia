-- Separa las listas de canciones por HORARIO, no solo por fecha — hasta
-- ahora, dos misas del mismo día (ej. domingo 12hs y domingo 19hs)
-- compartían una sola lista, y terminaban mezclándose canciones de una y
-- otra sin que quedara claro cuál era para cuál.
--
-- `hora` es opcional (texto vacío por defecto): una parroquia que solo
-- tiene una misa por día puede seguir sin usarlo, exactamente como
-- funcionaba antes — nada se rompe para quien no lo necesita.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- los datos existentes (quedan con hora = '', que es como funcionaban
-- hasta ahora: una lista por día).

alter table lista_actual add column if not exists hora text not null default '';
alter table lista_actual drop constraint if exists lista_actual_space_fecha_key;
alter table lista_actual add constraint lista_actual_space_fecha_hora_key unique (space, fecha, hora);

alter table misas add column if not exists hora text not null default '';
alter table misas drop constraint if exists misas_space_fecha_key;
