-- Cronograma: quién cubre cada misa. Dos cambios chicos.
--
-- 1) "miembros del equipo" se guardan en la misma tabla que ya usan las
--    carpetas agregadas y los tiempos/temas litúrgicos — solo hace falta
--    sumar 'miembro' a los valores permitidos en `kind`.
-- 2) `misas` (la lista de canciones de cada fecha+horario) suma una
--    columna `asignados`, con los nombres de quiénes cubren esa misa —
--    vive en el mismo registro que la lista de canciones, no en una tabla
--    aparte.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente.

alter table custom_labels drop constraint if exists custom_labels_kind_check;
alter table custom_labels add constraint custom_labels_kind_check check (kind in ('category', 'tag', 'miembro'));

alter table misas add column if not exists asignados jsonb not null default '[]';
