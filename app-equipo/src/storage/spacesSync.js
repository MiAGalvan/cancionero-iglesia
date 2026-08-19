// Sincroniza la lista de "Parroquias y capillas" entre dispositivos del
// equipo — antes vivía solo en el localStorage de cada uno (había que
// cargar cada parroquia a mano en cada celu/tablet). Mismo patrón que
// storage/sync.js (el cancionero): gana la edición más reciente
// (comparando `updatedAt`), con un "tombstone" (`deleted_at`) para que un
// borrado también se propague a los demás dispositivos.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getSession } from './auth.js';
import { getSpaces, replaceSpacesFromSync } from './settings.js';

// Se llama justo después de agregar o editar una parroquia localmente. Si
// no hay sesión o conexión, no hace nada — la próxima sincronización
// (syncSpacesNow) la termina subiendo igual, porque quedó más nueva que lo
// que haya en la nube.
export async function pushSpace(space) {
  if (!isSupabaseConfigured || !space) return false;
  const session = await getSession();
  if (!session) return false;
  const { error } = await supabase.from('spaces').upsert(
    {
      key: space.key,
      label: space.label,
      locality: space.locality || '',
      province: space.province || '',
      address: space.address || '',
      next_mass: space.nextMass || '',
      updated_at: space.updatedAt || new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'key' }
  );
  return !error;
}

// Se llama justo después de borrar una parroquia localmente, con la
// parroquia tal cual estaba ANTES de borrarla (para poder mandar su
// nombre, que la tabla pide como obligatorio incluso en el tombstone).
export async function pushSpaceDeletion(space) {
  if (!isSupabaseConfigured || !space) return false;
  const session = await getSession();
  if (!session) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from('spaces').upsert(
    {
      key: space.key,
      label: space.label,
      locality: space.locality || '',
      province: space.province || '',
      deleted_at: now,
      updated_at: now,
    },
    { onConflict: 'key' }
  );
  return !error;
}

// Trae los cambios de los demás dispositivos y sube los propios. Se puede
// llamar seguido (después de loguearse, al abrir "Parroquias y capillas",
// o con el botón 🔄 de la biblioteca): si no hay sesión o conexión,
// devuelve `{ synced: false }` sin tocar nada. `changed: true` avisa a
// quien llamó que hay que volver a pintar la pantalla (cambió la lista).
export async function syncSpacesNow() {
  if (!isSupabaseConfigured) return { synced: false, reason: 'not-configured' };

  const session = await getSession();
  if (!session) return { synced: false, reason: 'not-logged-in' };

  try {
    const { data: remoteSpaces, error } = await supabase.from('spaces').select('*');
    if (error) throw error;

    const localSpaces = getSpaces();
    const merged = new Map(localSpaces.map((space) => [space.key, space]));
    let changed = false;

    // 1. Lo remoto que sea más nuevo que la copia local (o que todavía no
    // existe localmente) se aplica — si vino con `deleted_at`, se saca de
    // la lista en vez de agregarse.
    for (const remote of remoteSpaces) {
      const local = merged.get(remote.key);
      const remoteIsNewer = !local || new Date(remote.updated_at) > new Date(local.updatedAt || 0);
      if (!remoteIsNewer) continue;

      changed = true;
      if (remote.deleted_at) {
        merged.delete(remote.key);
      } else {
        merged.set(remote.key, {
          key: remote.key,
          label: remote.label,
          locality: remote.locality || '',
          province: remote.province || '',
          address: remote.address || '',
          nextMass: remote.next_mass || '',
          updatedAt: remote.updated_at,
        });
      }
    }

    // 2. Lo local que sea más nuevo que lo remoto (o que todavía no existe
    // en la nube) se sube — típicamente, lo que se acaba de agregar/editar
    // en este dispositivo.
    const remoteByKey = new Map(remoteSpaces.map((space) => [space.key, space]));
    for (const local of localSpaces) {
      const remote = remoteByKey.get(local.key);
      const localIsNewer = !remote || new Date(local.updatedAt || 0) > new Date(remote.updated_at);
      if (localIsNewer) await pushSpace(local);
    }

    replaceSpacesFromSync(Array.from(merged.values()));
    return { synced: true, changed };
  } catch (error) {
    const reason = error?.code === '42501' ? 'not-authorized' : 'error';
    return { synced: false, reason, error };
  }
}
