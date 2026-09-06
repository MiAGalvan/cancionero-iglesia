-- Orden de las carpetas del cancionero (las 12 fijas + las agregadas),
-- elegido a mano con ▲/▼ en "Cancionero" — antes vivía solo en el
-- localStorage de CADA dispositivo del equipo, sin sincronizarse nunca:
-- una persona podía reordenar las carpetas en su celular y nadie más del
-- equipo lo veía. Ahora viaja junto con el resto de los datos de la
-- parroquia (color, horario, capillas), así que se sincroniza para todos.
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente — las parroquias que ya tenías cargadas quedan con el
-- orden de fábrica (las 12 fijas en su orden de siempre) hasta que alguien
-- reordene una carpeta desde algún dispositivo ya actualizado.

alter table spaces add column if not exists category_order jsonb not null default '[]';
