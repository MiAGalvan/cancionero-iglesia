-- Migración: logo por parroquia/capilla, visible como banner chico en la
-- página pública y en la app del equipo.
--
-- ANTES de correr esto: creá el bucket a mano en el dashboard —
-- Storage → New bucket → nombre "logos" → tildar "Public bucket" → Save.
-- Después sí, corré este script UNA vez en el SQL Editor. Es seguro
-- correrlo más de una vez.

create table if not exists espacio_logos (
  space text primary key,
  logo_url text,
  updated_at timestamptz not null default now()
);

alter table espacio_logos enable row level security;

drop policy if exists "lectura publica de logos" on espacio_logos;
create policy "lectura publica de logos"
  on espacio_logos for select
  to anon, authenticated
  using (true);

drop policy if exists "equipo autorizado sube o cambia el logo" on espacio_logos;
create policy "equipo autorizado sube o cambia el logo"
  on espacio_logos for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or espacio_logos.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado actualiza el logo" on espacio_logos;
create policy "equipo autorizado actualiza el logo"
  on espacio_logos for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or espacio_logos.space = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or espacio_logos.space = any(tm.spaces))
    )
  );

-- Políticas del bucket de Storage: solo controlan quién puede SUBIR
-- archivos (la lectura ya es pública por el toggle "Public bucket", no
-- hace falta una política aparte para eso). Cada archivo se guarda como
-- "{parroquia}/logo" — la carpeta es lo que se usa acá para saber de qué
-- parroquia es y chequear el permiso.
drop policy if exists "equipo autorizado sube su logo a storage" on storage.objects;
create policy "equipo autorizado sube su logo a storage"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado reemplaza su logo en storage" on storage.objects;
create policy "equipo autorizado reemplaza su logo en storage"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );
