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
  published_by text, -- email de quién tocó "Publicar" por última vez (solo visible dentro de la app, no en la página pública)
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
  space_name text, -- "Nombre — Localidad, Provincia", para mostrar de dónde es al compartirla
  title text not null,
  artist text not null default '',
  categories jsonb not null default '[]',
  chordpro text not null default '',
  shared boolean not null default true, -- true (default) = cualquier otra parroquia la puede ver y copiar a su cancionero; se puede destildar para el caso puntual de mantener una canción privada
  tags jsonb not null default '[]', -- tiempos/temas litúrgicos (Adviento, Cuaresma, Buen Pastor...), eje aparte de categories
  updated_by text, -- email de quién la creó/editó por última vez
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

-- Además de leer el cancionero propio (política de arriba), cualquier
-- persona del equipo logueada (de cualquier parroquia) puede leer las
-- canciones que OTRAS parroquias marcaron como "compartir" — para poder
-- copiarlas a su propio cancionero en vez de tipearlas de nuevo. Postgres
-- combina las dos políticas de SELECT con "o", así que esto no le quita
-- acceso a nada de lo que ya podía ver.
create policy "equipo lee canciones compartidas de otras parroquias"
  on songs
  for select
  to authenticated
  using (shared = true);

-- Mismo criterio que la política de arriba, pero para CUALQUIERA sin
-- sesión iniciada — así el equipo/coro puede buscar y ver letra+acordes
-- desde un celular que nunca se logueó, sin que eso habilite ninguna
-- edición (ver storage/publicCancionero.js). Las canciones marcadas
-- "no compartir" quedan afuera también acá.
create policy "lectura publica del cancionero compartido"
  on songs
  for select
  to anon
  using (shared = true and deleted_at is null);

-- --- espacio_logos: URL del logo de cada parroquia/capilla -------------
-- El archivo en sí vive en Supabase Storage (bucket "logos", creado a
-- mano desde el dashboard — ver supabase/SETUP.md); acá solo se guarda la
-- URL pública, para que la página pública la pueda leer con una consulta
-- simple, sin depender de la API de Storage.

create table if not exists espacio_logos (
  space text primary key,
  logo_url text,
  updated_at timestamptz not null default now()
);

alter table espacio_logos enable row level security;

create policy "lectura publica de logos"
  on espacio_logos
  for select
  to anon, authenticated
  using (true);

create policy "equipo autorizado sube o cambia el logo"
  on espacio_logos
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or espacio_logos.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado actualiza el logo"
  on espacio_logos
  for update
  to authenticated
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

-- --- Storage: bucket "logos" ---------------------------------------
-- El bucket lo tenés que crear a mano una sola vez: Dashboard → Storage →
-- New bucket → nombre "logos" → tildar "Public bucket". Estas políticas
-- solo controlan quién puede SUBIR archivos ahí (la lectura ya es pública
-- por el toggle del bucket, no hace falta una política aparte para eso).
-- Cada archivo tiene que guardarse como "{parroquia}/logo" — la carpeta es
-- lo que usamos acá para saber de qué parroquia es y chequear el permiso.

create policy "equipo autorizado sube su logo a storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );

create policy "equipo autorizado reemplaza su logo en storage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'logos'
    and exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or (storage.foldername(name))[1] = any(tm.spaces))
    )
  );

-- --- song_recordings: audio de cómo canta cada grupo cada canción --------
-- El archivo en sí vive en Supabase Storage (bucket "grabaciones", creado a
-- mano desde el dashboard igual que "logos" — ver supabase/SETUP.md); acá
-- se guarda la referencia. `id` se arma como "espacio|grupo|uuid_canción":
-- volver a grabar la MISMA canción con el MISMO grupo pisa la grabación
-- anterior en vez de acumular archivos sueltos (no hace falta lógica de
-- "borrar duplicados", el upsert por esa clave ya lo resuelve solo).
create table if not exists song_recordings (
  id text primary key,
  space text not null,
  space_name text, -- "Nombre — Localidad, Provincia", para mostrar de dónde es ("AUDIO DE MERCED") en Compartidas
  group_name text not null, -- grupo del dispositivo que grabó (ej. "SÁBADO 19HS"), ver storage/settings.js
  song_uuid text not null,
  song_title text not null, -- copiado de la canción al momento de grabar, para no depender de un join
  storage_path text not null,
  recorded_by text,
  updated_at timestamptz not null default now()
);

alter table song_recordings enable row level security;

-- Lectura abierta a cualquiera del equipo logueado, de cualquier parroquia:
-- a diferencia de las canciones (que son privadas salvo que se compartan a
-- propósito), el sentido de esto es justamente poder escuchar cómo canta
-- cada grupo/parroquia la misma canción — no hay nada que mantener privado.
create policy "equipo logueado escucha todas las grabaciones"
  on song_recordings
  for select
  to authenticated
  using (true);

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

-- --- Storage: bucket "grabaciones" -----------------------------------
-- Igual que "logos": creá el bucket a mano una sola vez (Dashboard →
-- Storage → New bucket → nombre "grabaciones" → tildar "Public bucket").
-- Cada archivo se guarda como "{parroquia}/{grupo}/{uuid_canción}.webm" —
-- la carpeta (primer segmento) es lo que se usa acá para saber de qué
-- parroquia es y chequear el permiso.

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

-- --- custom_labels: carpetas agregadas y tiempos/temas litúrgicos ------
-- Las carpetas (kind='category') SÍ son de una parroquia puntual (ej.
-- "DON BOSCO" es de Merced, no de las demás) — `space` guarda cuál. Los
-- tiempos/temas litúrgicos (kind='tag'), en cambio, son los mismos en
-- cualquier parroquia (Adviento es Adviento en todos lados), así que se
-- siguen compartiendo entre todas: siempre viajan con `space` en ''. No
-- hay chequeo de team_members para leer/agregar/borrar (nada sensible
-- viaja acá, son solo nombres) — cualquier integrante logueado puede.
create table if not exists custom_labels (
  kind text not null check (kind in ('category', 'tag')),
  name text not null,
  space text not null default '', -- '' para los tiempos/temas (compartidos); la key de la parroquia para carpetas
  updated_at timestamptz not null default now(),
  primary key (kind, name, space)
);

alter table custom_labels enable row level security;

create policy "equipo logueado lee carpetas y tiempos"
  on custom_labels
  for select
  to authenticated
  using (true);

create policy "equipo logueado agrega carpetas y tiempos"
  on custom_labels
  for insert
  to authenticated
  with check (true);

create policy "equipo logueado borra carpetas y tiempos"
  on custom_labels
  for delete
  to authenticated
  using (true);

-- --- spaces: lista de parroquias/capillas, sincronizada entre dispositivos
-- Antes esta lista vivía solo en localStorage de cada dispositivo (cada
-- celu/tablet tenía que cargarla a mano) — ahora se sincroniza como el
-- resto, con el mismo patrón de "gana la edición más reciente" +
-- tombstones para que un borrado también se propague (ver
-- app-equipo/src/storage/spacesSync.js).

create table if not exists spaces (
  key text primary key,
  label text not null,
  locality text not null default '',
  province text not null default '',
  address text not null default '', -- dirección, para mostrar en la página pública ("¿Vas a misa hoy?")
  next_mass text not null default '', -- texto libre tal cual lo quiere ver la gente, ej. "Miércoles 19 de agosto, 19:00 hs"
  instagram text not null default '',
  facebook text not null default '',
  youtube text not null default '',
  whatsapp text not null default '', -- ej. link de wa.me a un grupo o número de contacto
  horario_misas jsonb not null default '[]', -- [{dia: 0-6 (0=domingo, como Date.getDay()), hora: 'HH:MM'}], se repite cada semana
  capillas jsonb not null default '[]', -- [{id, nombre, direccion, horario}], informativas, sin cancionero propio
  color text not null default '', -- hex (ej. '#2f8a7a'), para diferenciarlas de un vistazo en "Parroquias y capillas"
  adoracion_dia integer, -- 0-6 (como horario_misas), null = esta parroquia no hace Adoración
  adoracion_hora text,
  adoracion_hora_fin text,
  adoracion_lugar text, -- si está vacío, la página pública usa `address`
  adoracion_invitacion text, -- texto corto que se ve al escanear el QR de Adoración, invitando a ir
  adoracion_canciones jsonb not null default '[]', -- [{id, titulo, tipo: 'cancionero'|'buscar'|'equipo'}]
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table spaces enable row level security;

create policy "lectura publica de espacios"
  on spaces
  for select
  to anon, authenticated
  using (true);

-- Mismo chequeo para insert/update/delete a propósito: como se sube con
-- upsert(), Postgres evalúa la política de INSERT incluso cuando el
-- resultado real es una actualización (fila ya existente) — si acá solo
-- dejáramos crear a un admin, un integrante normal ni siquiera podría
-- editar el nombre de SU propia parroquia. Con este chequeo simétrico: un
-- admin puede todo, y alguien no-admin puede crear/editar/borrar solo las
-- que ya tiene asignadas en team_members (una parroquia nueva de cero,
-- como es lógico, la tiene que dar de alta un admin).
create policy "equipo autorizado agrega o edita espacios"
  on spaces
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
    )
  );

create policy "equipo autorizado actualiza espacios"
  on spaces
  for update
  to authenticated
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

create policy "equipo autorizado borra espacios"
  on spaces
  for delete
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or spaces.key = any(tm.spaces))
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

-- --- anuncios: tabla pública, "Novedades" (avisos, eventos, lecturas) ---
-- Mismo patrón de permisos que lista_actual: cualquiera puede leerla (la ve
-- la página pública, junto con los cantos), pero solo el equipo autorizado
-- de esa parroquia puede crear/editar/borrar.

create table if not exists anuncios (
  id bigint generated always as identity primary key,
  space text not null,
  titulo text not null,
  cuerpo text not null default '',
  fecha date, -- solo para las 4 lecturas del día (ver migracion-fecha-lecturas.sql); null en avisos/eventos comunes
  vence date, -- solo para avisos comunes (ver migracion-vencimiento-avisos.sql): pasada esa fecha, la página pública deja de mostrarlo
  auto_generated boolean not null default false, -- true si la cargó sola pagina-publica/api/sync-lecturas.js, ver migracion-lecturas-automaticas.sql
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table anuncios enable row level security;

create policy "lectura publica de novedades"
  on anuncios
  for select
  to anon, authenticated
  using (true);

create policy "equipo autorizado agrega novedades"
  on anuncios
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado actualiza novedades"
  on anuncios
  for update
  to authenticated
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

create policy "equipo autorizado borra novedades"
  on anuncios
  for delete
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or anuncios.space = any(tm.spaces))
    )
  );

-- --- cron_status: para ver desde la app si el trabajo automático de
-- lecturas (pagina-publica/api/sync-lecturas.js) viene corriendo bien, o
-- se rompió en silencio alguna madrugada. Solo lo escribe ese trabajo,
-- con la service role key (no pasa por RLS) — no hay política de
-- insert/update para nadie más.
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
