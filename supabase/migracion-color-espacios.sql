-- Color identificador para cada parroquia/capilla (ej. '#2f8a7a') — para
-- diferenciarlas de un vistazo en "Parroquias y capillas", sobre todo
-- cuando hay varias con nombres parecidos.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente — las parroquias que ya tenías cargadas quedan sin color
-- (se ven sin ninguna marca hasta que alguien les elija uno).

alter table spaces add column if not exists color text not null default '';
