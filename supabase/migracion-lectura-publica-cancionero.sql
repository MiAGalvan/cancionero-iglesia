-- Permite buscar y ver canciones (letra + acordes) SIN sesión iniciada —
-- para que cualquiera del equipo/coro pueda mirar el cancionero desde un
-- celular que nunca se logueó, sin que eso le abra ninguna puerta de
-- edición (crear/editar/borrar sigue pidiendo sesión, sin cambios).
--
-- Alcance: solo las canciones marcadas shared=true (que es el valor por
-- defecto — la gran mayoría) de CUALQUIER parroquia. Es el mismo límite
-- que ya existe hoy para que otras parroquias vean canciones compartidas
-- en "Biblioteca compartida" (ver la política "equipo lee canciones
-- compartidas de otras parroquias" en schema.sql) — acá se lo extiende a
-- cualquiera con el link, no solo a otro equipo logueado.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente.

drop policy if exists "lectura publica del cancionero compartido" on songs;
create policy "lectura publica del cancionero compartido"
  on songs
  for select
  to anon
  using (shared = true and deleted_at is null);
