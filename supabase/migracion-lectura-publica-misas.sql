-- Permite LEER (nunca escribir) las listas de misa guardadas SIN sesión
-- iniciada — para el Modo ensayo: alguien del equipo arma y sincroniza la
-- lista con su sesión de siempre, y el resto del equipo, sin loguearse,
-- puede verla (letra + acordes) en su propio celular para ensayar. Escribir
-- sigue pidiendo sesión real, sin excepción — esto solo agrega lectura.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente.

create policy "lectura publica de misas guardadas (para ensayar)"
  on misas
  for select
  to anon
  using (true);
