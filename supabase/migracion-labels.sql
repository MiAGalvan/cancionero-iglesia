-- Migración: sincroniza entre dispositivos las carpetas agregadas y los
-- tiempos/temas litúrgicos agregados (antes solo vivían en el
-- localStorage de cada dispositivo — agregar uno en el celu no aparecía
-- en la compu).
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase. Es seguro
-- correrlo más de una vez.

create table if not exists custom_labels (
  kind text not null check (kind in ('category', 'tag')),
  name text not null,
  updated_at timestamptz not null default now(),
  primary key (kind, name)
);

alter table custom_labels enable row level security;

drop policy if exists "equipo logueado lee carpetas y tiempos" on custom_labels;
create policy "equipo logueado lee carpetas y tiempos"
  on custom_labels for select to authenticated
  using (true);

drop policy if exists "equipo logueado agrega carpetas y tiempos" on custom_labels;
create policy "equipo logueado agrega carpetas y tiempos"
  on custom_labels for insert to authenticated
  with check (true);

drop policy if exists "equipo logueado borra carpetas y tiempos" on custom_labels;
create policy "equipo logueado borra carpetas y tiempos"
  on custom_labels for delete to authenticated
  using (true);
