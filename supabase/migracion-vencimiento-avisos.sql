-- Fecha de vencimiento opcional para los avisos comunes (ej. "Tallarineada
-- este sábado") — una vez pasada esa fecha, la página pública deja de
-- mostrarlos solos, sin que nadie tenga que acordarse de borrarlos a mano.
-- No afecta a las lecturas (1ª Lectura, Salmo, etc.): esas ya tienen su
-- propio campo `fecha` con otro significado (para qué día es esa lectura),
-- y no usan `vence`.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente — los avisos que ya tenías cargados quedan sin fecha de
-- vencimiento (siguen viéndose para siempre, como hasta ahora).

alter table anuncios add column if not exists vence date;
