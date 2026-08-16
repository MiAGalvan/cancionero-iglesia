-- Migración: pasa "compartir con otras parroquias" de opt-in a
-- comportamiento por defecto — el catálogo de cantos de iglesia está
-- pensado para compartirse, no para quedar privado. Marca TODO lo que ya
-- estaba cargado como compartido (antes solo lo veía el admin en
-- Compartidas, ahora lo ve cualquier integrante logueado de cualquier
-- parroquia), y hace que las canciones nuevas salgan compartidas de
-- arranque — se puede destildar el check "Compartir" para el caso puntual
-- de una canción que un equipo prefiera mantener privada.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase. Es seguro
-- correrlo más de una vez.

update songs set shared = true where shared = false;
alter table songs alter column shared set default true;
