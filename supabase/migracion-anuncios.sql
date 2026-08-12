-- Migración: agrega "Novedades" (anuncios, eventos, lecturas del día) por
-- parroquia. Se ven en la página pública junto con los cantos, y solo el
-- equipo autorizado de esa parroquia (mismo team_members de siempre) puede
-- crear/editar/borrar.
--
-- Corré esto UNA vez en el SQL Editor de tu proyecto Supabase, por separado
-- de los demás archivos .sql. Es seguro correrlo más de una vez.

create table if not exists anuncios (
  id bigint generated always as identity primary key,
  space text not null,
  titulo text not null,
  cuerpo text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table anuncios enable row level security;

drop policy if exists "lectura publica de novedades" on anuncios;
create policy "lectura publica de novedades"
  on anuncios for select
  to anon, authenticated
  using (true);

drop policy if exists "equipo autorizado agrega novedades" on anuncios;
create policy "equipo autorizado agrega novedades"
  on anuncios for insert to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado actualiza novedades" on anuncios;
create policy "equipo autorizado actualiza novedades"
  on anuncios for update to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  );

drop policy if exists "equipo autorizado borra novedades" on anuncios;
create policy "equipo autorizado borra novedades"
  on anuncios for delete to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  );
