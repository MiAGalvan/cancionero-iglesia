-- Sincroniza "Misas guardadas" (las listas armadas, publicadas o no) entre
-- los dispositivos del equipo — antes vivían solo en el IndexedDB de CADA
-- aparato: alguien armaba la lista del domingo que viene en la tablet de
-- la iglesia, y en el celular de otra persona del equipo no aparecía por
-- ningún lado, así que terminaba armando otra por su cuenta o publicando
-- sin darse cuenta de que ya había una hecha (pisándola). Tabla PRIVADA,
-- igual que `songs` — nunca pública, a diferencia de `lista_actual` (la
-- FOTO ya publicada, sin acordes).
--
-- Corré esto UNA sola vez en el SQL Editor de Supabase. No borra ni toca
-- nada existente.

create table if not exists misas (
  id text primary key, -- "{space}|{fecha}", igual que la clave local en IndexedDB
  space text not null,
  fecha date not null,
  items jsonb not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (space, fecha)
);

alter table misas enable row level security;

create policy "equipo autorizado lee sus misas guardadas"
  on misas
  for select
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or misas.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado crea misas guardadas"
  on misas
  for insert
  to authenticated
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or misas.space = any(tm.spaces))
    )
  );

create policy "equipo autorizado actualiza misas guardadas"
  on misas
  for update
  to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or misas.space = any(tm.spaces))
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.user_id = auth.uid()
        and (tm.is_admin or misas.space = any(tm.spaces))
    )
  );
