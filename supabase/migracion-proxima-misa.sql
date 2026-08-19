-- Migración: agrega dirección y "próxima misa" a cada parroquia/capilla,
-- para mostrar en la nueva pantalla de Inicio de la página pública
-- ("¿Vas a misa hoy?"). Corré esto UNA vez en el SQL Editor de tu proyecto
-- Supabase. Es seguro correrlo más de una vez.

alter table spaces add column if not exists address text not null default '';
alter table spaces add column if not exists next_mass text not null default '';
