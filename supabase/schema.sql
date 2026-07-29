-- Cancionero Iglesia: esquema completo (instalación nueva desde cero).
-- Correr esto una sola vez en el SQL Editor de tu proyecto Supabase
-- (Dashboard → SQL Editor → New query → pegar todo → Run).
--
-- ⚠️ Si ya tenías el proyecto armado de antes (con lista_actual y/o songs
-- ya creadas), NO vuelvas a pegar este archivo entero — corré en cambio,
-- en este orden, migracion-espacios.sql y después migracion-permisos.sql,
-- pensados para actualizar sin romper nada de lo que ya corriste.

-- --- team_members: quién puede tocar qué parroquia -------------------
-- Cada persona del equipo (una vez que ya tiene su usuario en
-- Authentication → Users) necesita además una fila acá para poder leer o
-- escribir el cancionero/lista de cualquier parroquia — sin esta fila, no
-- puede tocar nada (ver supabase/SETUP.md). `is_admin = true` da acceso a
-- TODAS las parroquias (para vos, como responsable de todo el sistema);
-- si no es admin, solo puede tocar las que estén en `spaces`.
create table if not exists team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  spaces text[] not null default '{}'
);

alter table team_members enable row level security;

create policy "cada uno ve su propia fila"
  on team_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- No hay política de insert/update/delete para "authenticated" a
-- propósito: esta tabla solo se administra vos, desde el Table Editor o el
-- SQL Editor del dashboard (que usan tu acceso de dueño del proyecto, no
-- pasan por estas políticas).

-- --- lista_actual: tabla pública, sin acordes -------------------------
-- Guarda una fila por parroquia (espacio) + fecha de misa. La página
-- pública siempre pide la más reciente de esa parroquia (order by fecha
-- desc limit 1), así que no hace falta borrar nada: las fechas viejas
-- quedan como historial.

create table if not exists lista_actual (
  id bigint generated always as identity primary key,
  space text not null default 'merced',
  space_name text, -- "Nombre — Localidad, Provincia" tal cual se ve en la app al publicar
  fecha date not null,
  items jsonb not null,
  updated_at timestamptz not null default now(),
  unique (space, fecha)
);

-- Row Level Security: sin esto, cualquiera con la anon key (que queda
-- visible en el código del frontend, es pública por diseño) podría leer Y
-- escribir libremente. Con RLS activado, cada política dice explícitamente
-- qué puede hacer cada rol.
alter table lista_actual enable row level security;

-- Lectura: cualquiera puede leer, con o sin login (así funciona la página
-- del QR, que nunca inicia sesión). Esta política no cambia con los
-- permisos por parroquia — la lista publicada siempre es pública para
-- cualquiera que la mire, lo que se restringe es quién puede ESCRIBIRLA.
create policy "lectura publica"
  on lista_actual
  for select
  to anon, authenticated
  using (true);

-- Escritura: solo alguien logueado que en team_members sea admin, o que
-- tenga esta parroquia en su lista de `spaces`. El rechazo pasa siempre en
-- el servidor de Supabase, no importa qué se intente desde el navegador.
create policy "escritura solo equipo autorizado"
  on lista_actual
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or lista_actual.space = any(tm.spaces))
    )
  );

create policy "actualizacion solo equipo autorizado"
  on lista_actual
  for update
  to authenticated
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

-- --- songs: tabla privada, cancionero completo con acordes ------------
-- A diferencia de `lista_actual` (pública, sin acordes), esta tabla guarda
-- el cancionero COMPLETO con acordes incluidos, para que se pueda
-- sincronizar entre las tablets/celulares del equipo. No hay ninguna
-- política para el rol "anon": sin una política que lo autorice
-- explícitamente, RLS le niega todo por default — ni lectura ni escritura.
-- Solo alguien logueado Y autorizado en team_members para esa parroquia
-- puede ver o tocar sus canciones.

create table if not exists songs (
  uuid text primary key,
  space text not null default 'merced',
  title text not null,
  artist text not null default '',
  categories jsonb not null default '[]',
  chordpro text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table songs enable row level security;

create policy "equipo autorizado lee el cancionero"
  on songs
  for select
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado agrega canciones"
  on songs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or songs.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado actualiza canciones"
  on songs
  for update
  to authenticated
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
