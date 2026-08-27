-- Adoración al Santísimo: día/horario, lugar, texto de invitación y cantos
-- sugeridos, guardados como columnas nuevas en la tabla `spaces` que ya
-- existe (mismo lugar donde vive el horario semanal de misas) — no hace
-- falta una tabla aparte. La reflexión del día (columna MEDITATIO del
-- mismo feed que ya usan las lecturas) se guarda en `anuncios` como
-- cualquier otra lectura, así que no necesita ninguna migración nueva acá.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase (Project → SQL
-- Editor → New query, pegar y "Run"). No borra ni toca nada existente.

alter table spaces add column if not exists adoracion_dia integer;
alter table spaces add column if not exists adoracion_hora text;
alter table spaces add column if not exists adoracion_hora_fin text;
alter table spaces add column if not exists adoracion_lugar text;
alter table spaces add column if not exists adoracion_invitacion text;
alter table spaces add column if not exists adoracion_canciones jsonb not null default '[]'::jsonb;
