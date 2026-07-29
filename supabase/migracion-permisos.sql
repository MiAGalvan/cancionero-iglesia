-- Migración: cada persona del equipo solo puede tocar el cancionero y la
-- lista de SU parroquia (antes, cualquiera logueado podía tocar la de
-- cualquier parroquia). Vos, como responsable de todo, podés marcarte como
-- "admin" y tener acceso a todas.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase, por
-- separado de los demás archivos .sql. Es seguro correrlo más de una vez.

-- 1. Tabla nueva: quién puede tocar qué parroquia. Por ahora queda vacía —
-- en el paso 2 de más abajo (o desde supabase/SETUP.md) se carga una fila
-- por persona.
create table if not exists team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  spaces text[] not null default '{}'
);

alter table team_members enable row level security;

drop policy if exists "cada uno ve su propia fila" on team_members;
create policy "cada uno ve su propia fila"
  on team_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- 2. Reemplazamos las políticas viejas de "songs" (que dejaban a
-- CUALQUIER usuario logueado tocar cualquier parroquia) por unas que
-- chequean team_members.
drop policy if exists "equipo lee el cancionero" on songs;
drop policy if exists "equipo autorizado lee el cancionero" on songs;
create policy "equipo autorizado lee el cancionero"
  on songs for select to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo agrega canciones" on songs;
drop policy if exists "equipo autorizado agrega canciones" on songs;
create policy "equipo autorizado agrega canciones"
  on songs for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo actualiza canciones" on songs;
drop policy if exists "equipo autorizado actualiza canciones" on songs;
create policy "equipo autorizado actualiza canciones"
  on songs for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  );

-- 3. Lo mismo para "lista_actual" — OJO: la lectura pública (para el QR,
-- sin login) NO se toca, sigue abierta a cualquiera. Solo se restringe
-- quién puede ESCRIBIRLA.
drop policy if exists "escritura solo equipo" on lista_actual;
drop policy if exists "escritura solo equipo autorizado" on lista_actual;
create policy "escritura solo equipo autorizado"
  on lista_actual for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or lista_actual.space = any(tm.spaces))
    )
  );

drop policy if exists "actualizacion solo equipo" on lista_actual;
drop policy if exists "actualizacion solo equipo autorizado" on lista_actual;
create policy "actualizacion solo equipo autorizado"
  on lista_actual for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or lista_actual.space = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or lista_actual.space = any(tm.spaces))
    )
  );

-- ⚠️ Importante: hasta que no cargues tu propia fila en team_members (ver
-- supabase/SETUP.md, "Cargar el equipo en team_members"), NINGÚN usuario
-- va a poder publicar ni sincronizar — ni siquiera vos. Es esperable, no
-- es un error: cargá esa fila apenas termines de correr esto.
