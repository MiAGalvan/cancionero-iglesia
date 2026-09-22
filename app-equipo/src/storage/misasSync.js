// Sincroniza "Misas guardadas" (las listas armadas, publicadas o no) entre
// los dispositivos del equipo, usando la tabla PRIVADA `misas` de Supabase
// — igual que el cancionero completo (ver storage/sync.js), nunca pública.
// Antes cada lista vivía solo en el IndexedDB del dispositivo donde se
// armó: alguien preparaba el domingo que viene en la tablet de la iglesia
// y, si otra persona del equipo abría la app en su celular, no la veía —
// terminaba armando otra por su cuenta, o publicando sin darse cuenta de
// que ya había una hecha (pisándola).
//
// Cada canción se manda por su uuid, no por el id local (autoincremental,
// distinto en cada dispositivo) — mismo criterio que lista_actual/
// publicar.js. Si una canción referenciada todavía no sincronizó a ESTE
// dispositivo en particular, esa canción puntual queda afuera al bajar (no
// rompe el resto de la lista); se puede agregar a mano una vez que
// sincronice, o va a aparecer sola la próxima vez que se sincronice de
// nuevo.
//
// Mismo criterio de "gana el que se guardó más tarde" que sync.js — para un
// equipo chico de voluntarios alcanza, sin necesidad de un merge más fino.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAllMisas, getMisa, getSong, getSongByUuid, applyRemoteMisa } from './db.js';
import { getSession } from './auth.js';
import { getCurrentSpaceKey, getDeviceGroup } from './settings.js';

function toIdArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// { categoria: [songId locales, ...] } -> { categoria: [uuid, ...] }. Una
// canción que ya se borró de este dispositivo (o que nunca tuvo uuid, caso
// rarísimo) simplemente no viaja.
async function itemsALocalAUuid(items) {
  const result = {};
  for (const [categoria, ids] of Object.entries(items || {})) {
    const uuids = [];
    for (const id of toIdArray(ids)) {
      const song = await getSong(id);
      if (song?.uuid) uuids.push(song.uuid);
    }
    if (uuids.length) result[categoria] = uuids;
  }
  return result;
}

// { categoria: [uuid, ...] } -> { categoria: [songId de ESTE dispositivo, ...] }.
async function itemsDeUuidALocal(items) {
  const result = {};
  for (const [categoria, uuids] of Object.entries(items || {})) {
    const ids = [];
    for (const uuid of toIdArray(uuids)) {
      const song = await getSongByUuid(uuid);
      if (song) ids.push(song.id);
    }
    if (ids.length) result[categoria] = ids;
  }
  return result;
}

export async function syncMisasNow() {
  if (!isSupabaseConfigured) return { synced: false, reason: 'not-configured' };

  const session = await getSession();
  if (!session) return { synced: false, reason: 'not-logged-in' };

  const space = getCurrentSpaceKey();

  try {
    const { data: remoteMisas, error: fetchError } = await supabase.from('misas').select('*').eq('space', space);
    if (fetchError) throw fetchError;

    // Bajar lo que sea más nuevo que la copia local (o que todavía no
    // existe localmente).
    let pulled = 0;
    for (const remote of remoteMisas) {
      const local = await getMisa(space, remote.fecha);
      const remoteIsNewer = !local || new Date(remote.updated_at) > new Date(local.updatedAt);
      if (!remoteIsNewer) continue;
      const items = await itemsDeUuidALocal(remote.items);
      await applyRemoteMisa({ space, fecha: remote.fecha, items, updatedAt: remote.updated_at });
      pulled += 1;
    }

    // Subir lo local que sea más nuevo que lo que hay en la nube (o que
    // todavía no existe ahí) — típicamente, lo que se acaba de guardar en
    // este dispositivo.
    const remoteByFecha = new Map(remoteMisas.map((misa) => [misa.fecha, misa]));
    const localMisas = await getAllMisas(space);

    let pushed = 0;
    for (const misa of localMisas) {
      const remote = remoteByFecha.get(misa.fecha);
      const localIsNewer = !remote || new Date(misa.updatedAt) > new Date(remote.updated_at);
      if (!localIsNewer) continue;

      const items = await itemsALocalAUuid(misa.items);
      const { error } = await supabase.from('misas').upsert(
        {
          id: `${space}|${misa.fecha}`,
          space,
          fecha: misa.fecha,
          items,
          updated_by: getDeviceGroup() || session.user?.email || null,
          updated_at: misa.updatedAt,
        },
        { onConflict: 'id' }
      );
      if (error) throw error;
      pushed += 1;
    }

    return { synced: true, pulled, pushed };
  } catch (error) {
    const reason = error?.code === '42501' ? 'not-authorized' : 'error';
    return { synced: false, reason, error };
  }
}
