-- Cancionero Iglesia: tabla pública "lista_actual".
-- Correr esto una sola vez en el SQL Editor de tu proyecto Supabase
-- (Dashboard → SQL Editor → New query → pegar todo → Run).
--
-- Guarda una fila por fecha de misa. La página pública siempre pide la más
-- reciente (order by fecha desc limit 1), así que no hace falta borrar nada:
-- las fechas viejas quedan como historial.

create table if not exists lista_actual (
  id bigint generated always as identity primary key,
  fecha date not null unique,
  items jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: sin esto, cualquiera con la anon key (que queda
-- visible en el código del frontend, es pública por diseño) podría leer Y
-- escribir libremente. Con RLS activado, cada política dice explícitamente
-- qué puede hacer cada rol.
alter table lista_actual enable row level security;

-- Lectura: cualquiera puede leer, con o sin login (así funciona la página
-- del QR, que nunca inicia sesión).
create policy "lectura publica"
  on lista_actual
  for select
  to anon, authenticated
  using (true);

-- Escritura: SOLO con sesión de Supabase Auth iniciada (rol "authenticated").
-- Esto es lo que de verdad protege la tabla: no importa qué intente hacer
-- alguien desde las herramientas del navegador en la página pública, el
-- rechazo pasa en el servidor de Supabase, no en el frontend.
create policy "escritura solo equipo"
  on lista_actual
  for insert
  to authenticated
  with check (true);

create policy "actualizacion solo equipo"
  on lista_actual
  for update
  to authenticated
  using (true)
  with check (true);

-- Cancionero Iglesia: tabla privada "songs".
-- A diferencia de `lista_actual` (pública, sin acordes), esta tabla guarda
-- el cancionero COMPLETO con acordes incluidos, para que se pueda
-- sincronizar entre las tablets/celulares del equipo (ej. alguien agrega
-- una canción desde su celu en el ensayo, y aparece en la tablet la
-- próxima vez que sincronice). Por eso acá NO hay ninguna política para el
-- rol "anon": sin una política que lo autorice explícitamente, RLS le
-- niega todo por default — ni lectura ni escritura. Solo el equipo
-- logueado puede ver y tocar esta tabla.

create table if not exists songs (
  uuid text primary key,
  title text not null,
  artist text not null default '',
  categories jsonb not null default '[]',
  chordpro text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table songs enable row level security;

create policy "equipo lee el cancionero"
  on songs
  for select
  to authenticated
  using (true);

create policy "equipo agrega canciones"
  on songs
  for insert
  to authenticated
  with check (true);

create policy "equipo actualiza canciones"
  on songs
  for update
  to authenticated
  using (true)
  with check (true);
