-- Horario semanal recurrente de misa (día + hora, se repite todas las
-- semanas) y capillas informativas que pertenecen a una parroquia (sin
-- cancionero ni QR propio, solo nombre + dirección + horario para mostrar
-- en la página pública). Ver SETUP.md para el detalle.
alter table spaces add column if not exists horario_misas jsonb not null default '[]';
alter table spaces add column if not exists capillas jsonb not null default '[]';
