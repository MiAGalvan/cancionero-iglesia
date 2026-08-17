-- Migración: agrega la tabla de grabaciones de audio (cómo canta cada
-- grupo/parroquia cada canción) para poder escucharlas entre parroquias
-- desde "Compartidas". Corré esto UNA vez en el SQL Editor de tu proyecto
-- Supabase, DESPUÉS de crear el bucket de Storage a mano (ver más abajo).
-- Es seguro correrlo más de una vez.

create table if not exists song_recordings (
  id text primary key,
  space text not null,
  space_name text,
  group_name text not null,
  song_uuid text not null,
  song_title text not null,
  storage_path text not null,
  recorded_by text,
  updated_at timestamptz not null default now()
);

alter table song_recordings enable row level security;

drop policy if exists "equipo logueado escucha todas las grabaciones" on song_recordings;
create policy "equipo logueado escucha todas las grabaciones"
  on song_recordings
  for select
  to authenticated
  using (true);

drop policy if exists "equipo autorizado sube grabaciones de su parroquia" on song_recordings;
create policy "equipo autorizado sube grabaciones de su parroquia"
  on song_recordings
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or song_recordings.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado reemplaza o borra sus grabaciones" on song_recordings;
create policy "equipo autorizado reemplaza o borra sus grabaciones"
  on song_recordings
  for all
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or song_recordings.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado sube grabaciones a storage" on storage.objects;
create policy "equipo autorizado sube grabaciones a storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'grabaciones'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado reemplaza sus grabaciones en storage" on storage.objects;
create policy "equipo autorizado reemplaza sus grabaciones en storage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'grabaciones'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );

-- ⚠️ Antes o después de correr esto, creá el bucket a mano UNA vez:
-- Dashboard de Supabase → Storage → New bucket → nombre exacto "grabaciones"
-- → tildar "Public bucket" → Create bucket. Sin esto, subir audio va a
-- fallar aunque el resto de la migración haya salido bien.
