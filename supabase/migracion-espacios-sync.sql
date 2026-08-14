-- Migración: sincroniza la lista de "Parroquias y capillas" entre
-- dispositivos (antes vivía solo en el localStorage de cada uno — había
-- que cargar cada parroquia a mano en cada celu/tablet).
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase. Es seguro
-- correrlo más de una vez.

create table if not exists spaces (
  key text primary key,
  label text not null,
  locality text not null default '',
  province text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table spaces enable row level security;

drop policy if exists "lectura publica de espacios" on spaces;
create policy "lectura publica de espacios"
  on spaces for select
  to anon, authenticated
  using (true);

-- Mismo chequeo para insert/update/delete a propósito: como se sube con
-- upsert(), Postgres evalúa la política de INSERT incluso cuando el
-- resultado real es una actualización (fila ya existente) — si acá solo
-- dejáramos crear a un admin, un integrante normal ni siquiera podría
-- editar el nombre de SU propia parroquia.
drop policy if exists "equipo autorizado agrega o edita espacios" on spaces;
create policy "equipo autorizado agrega o edita espacios"
  on spaces for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado actualiza espacios" on spaces;
create policy "equipo autorizado actualiza espacios"
  on spaces for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado borra espacios" on spaces;
create policy "equipo autorizado borra espacios"
  on spaces for delete to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
    )
  );
