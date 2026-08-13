-- Migración: agrega "tags" (tiempos/temas litúrgicos: Adviento, Cuaresma,
-- Buen Pastor, etc.) a las canciones — un eje aparte de las categorías
-- (que son el MOMENTO de la misa: Entrada, Comunión...). Sirve para poder
-- filtrar "Lista de misa" según el tiempo litúrgico de la semana.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase. Es seguro
-- correrlo más de una vez.

alter table songs add column if not exists tags jsonb not null default '[]';
