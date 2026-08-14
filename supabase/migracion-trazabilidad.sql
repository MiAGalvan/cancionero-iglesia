-- Migración: guarda quién publicó cada lista y quién editó por última vez
-- cada canción (el email de la cuenta con la que se hizo). Solo se ve
-- dentro de la app del equipo — la página pública nunca lo muestra.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase. Es seguro
-- correrlo más de una vez.

alter table lista_actual add column if not exists published_by text;
alter table songs add column if not exists updated_by text;
