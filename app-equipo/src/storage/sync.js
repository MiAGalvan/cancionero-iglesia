// Sincroniza el cancionero completo (con acordes) entre los dispositivos
// del equipo, usando la tabla PRIVADA `songs` de Supabase (protegida por
// login, separada de la tabla pública `lista_actual` de la lista de misa —
// acá sí viajan los acordes, porque solo el equipo logueado puede leerla).
//
// Regla simple para no pisarse entre dos ediciones: "gana el que se guardó
// más tarde" (se compara `updatedAt`). Si dos personas editan la MISMA
// canción sin conexión al mismo tiempo, cuando ambas sincronizan se queda
// la que se guardó último — no se hace un merge línea por línea. Para un
// equipo chico de voluntarios alcanza y sobra; si hiciera falta más
// precisión habría que avisar en la UI cuándo hay un choque, pero eso
// queda para más adelante si realmente se vuelve un problema.
//
// Si no hay sesión iniciada o no hay conexión, syncNow() no hace nada (ni
// rompe nada): el resto de la app sigue funcionando 100% offline igual.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getAllSongs, getSongByUuid, applyRemoteSong, deleteSongByUuid } from './db.js';
import { getSession } from './auth.js';
import { getCurrentSpaceKey, getSpaceFullLabel } from './settings.js';

const PENDING_DELETES_KEY = 'cancionero-iglesia:pending-deletes';

function getPendingDeletes() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function setPendingDeletes(uuids) {
  localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(uuids));
}

// Marca una canción como borrada en Supabase (no se borra la fila de
// verdad: queda con `deleted_at` puesto, como un "tombstone", para que la
// próxima vez que otro dispositivo sincronice sepa que tiene que borrarla
// también en vez de simplemente no encontrarla).
async function pushTombstone(uuid) {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('songs')
    .upsert({ uuid, deleted_at: now, updated_at: now }, { onConflict: 'uuid' });
  return !error;
}

// Se llama justo después de borrar una canción localmente. Si hay sesión y
// conexión, avisa ya mismo a Supabase para que desaparezca en los demás
// dispositivos; si falla (sin conexión, por ejemplo), la deja anotada para
// la próxima vez que se sincronice — así el borrado nunca se pierde, solo
// se demora.
export async function propagateDelete(uuid) {
  if (!uuid) return;
  const pushed = await pushTombstone(uuid);
  if (!pushed) {
    setPendingDeletes([...getPendingDeletes(), uuid]);
  }
}

// Trae los cambios de los demás dispositivos y sube los propios. Se puede
// llamar seguido (después de loguearse, después de guardar o borrar una
// canción, o a mano con el botón "Sincronizar"): si no hay sesión o no hay
// conexión, devuelve `{ synced: false }` sin tocar nada.
export async function syncNow() {
  if (!isSupabaseConfigured) return { synced: false, reason: 'not-configured' };

  const session = await getSession();
  if (!session) return { synced: false, reason: 'not-logged-in' };

  const space = getCurrentSpaceKey();

  try {
    // 1. Primero, los borrados pendientes de este dispositivo (por si se
    // borró algo estando sin conexión): así no "resucitan" por accidente
    // al subir el resto de las canciones más abajo.
    const pending = getPendingDeletes();
    for (const uuid of pending) {
      await pushTombstone(uuid);
    }
    if (pending.length) setPendingDeletes([]);

    // 2. Bajar todo lo que hay en la nube PARA ESTE ESPACIO (parroquia) y
    // aplicar lo que sea más nuevo que la copia local (o que todavía no
    // existe localmente). El cancionero de cada parroquia es independiente
    // del de las demás, así que nunca se mezclan acá.
    const { data: remoteSongs, error: fetchError } = await supabase
      .from('songs')
      .select('*')
      .eq('space', space);
    if (fetchError) throw fetchError;

    let pulled = 0;
    for (const remote of remoteSongs) {
      const local = await getSongByUuid(remote.uuid);
      const remoteIsNewer = !local || new Date(remote.updated_at) > new Date(local.updatedAt);
      if (!remoteIsNewer) continue;

      if (remote.deleted_at) {
        if (local) await deleteSongByUuid(remote.uuid);
      } else {
        await applyRemoteSong(remote);
      }
      pulled += 1;
    }

    // 3. Subir lo local de este espacio que sea más nuevo que lo que hay en
    // la nube (o que todavía no existe en la nube) — típicamente, lo que
    // se acaba de crear o editar en este dispositivo.
    const remoteByUuid = new Map(remoteSongs.map((song) => [song.uuid, song]));
    const localSongs = await getAllSongs(space);

    let pushed = 0;
    for (const song of localSongs) {
      const remote = remoteByUuid.get(song.uuid);
      const localIsNewer = !remote || new Date(song.updatedAt) > new Date(remote.updated_at);
      if (!localIsNewer) continue;

      const { error } = await supabase.from('songs').upsert(
        {
          uuid: song.uuid,
          space: song.space,
          space_name: getSpaceFullLabel(song.space),
          title: song.title,
          artist: song.artist,
          categories: song.categories,
          chordpro: song.chordpro,
          shared: song.shared || false,
          updated_at: song.updatedAt,
          deleted_at: null,
        },
        { onConflict: 'uuid' }
      );
      if (error) throw error;
      pushed += 1;
    }

    return { synced: true, pulled, pushed };
  } catch (error) {
    // Código 42501 = "violates row-level security policy": no es un
    // problema de conexión, es que este usuario no tiene permiso para
    // tocar esta parroquia en particular (ver supabase/SETUP.md, paso 8).
    const reason = error?.code === '42501' ? 'not-authorized' : 'error';
    return { synced: false, reason, error };
  }
}
