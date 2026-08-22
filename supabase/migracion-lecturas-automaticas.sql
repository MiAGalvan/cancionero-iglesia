-- Publicación automática de las lecturas del día (ver
-- pagina-publica/api/sync-lecturas.js): agrega la columna que distingue
-- una lectura cargada por el trabajo automático de una corregida a mano
-- por el equipo (para no pisar nunca una corrección humana), y una tabla
-- chica para poder ver desde la app si el trabajo automático viene
-- corriendo bien o se rompió en silencio.
alter table anuncios add column if not exists auto_generated boolean not null default false;

create table if not exists cron_status (
  job text primary key,
  last_run_at timestamptz,
  last_success boolean,
  last_error text,
  spaces_updated int
);

alter table cron_status enable row level security;

create policy "equipo logueado lee el estado de los trabajos automaticos"
  on cron_status
  for select
  to authenticated
  using (true);

-- A propósito, no hay política de insert/update para authenticated ni
-- anon: esta tabla la escribe solo el trabajo automático, que usa la
-- service role key (no pasa por RLS).
