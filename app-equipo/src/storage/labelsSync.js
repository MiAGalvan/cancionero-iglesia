// Sincroniza entre dispositivos las carpetas agregadas y los tiempos/temas
// litúrgicos agregados (ver storage/settings.js).
//
// Las carpetas SÍ son "de una parroquia" (ej. "DON BOSCO" es de Merced,
// no de las demás) — se sincronizan filtradas por `space`. Los
// tiempos/temas litúrgicos, en cambio, son los mismos en cualquier
// parroquia (Adviento es Adviento en todos lados), así que se siguen
// compartiendo entre todas: siempre viajan con `space` vacío.
//
// Merge simple a propósito: al sincronizar, solo se AGREGAN localmente los
// nombres que vengan de la nube y todavía no estén acá — nunca se borra
// nada local por ausencia remota. Así, si alguien acaba de agregar una
// carpeta en este dispositivo, un sync nunca se la puede "comer" por un
// borrado viejo hecho en otro lado. Borrar de verdad para todos los
// dispositivos pasa solo cuando alguien la borra a propósito (ver
// pushCustomCategoryDeletion) — no hay tombstones ni conflictos que
// resolver, porque acá no se "edita" nada, solo se agrega o se borra.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getSession } from './auth.js';
import { getCurrentSpaceKey, getCustomCategories, addCustomCategory, getCustomTags, addCustomTag } from './settings.js';

async function pushLabel(kind, name, space) {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const { error } = await supabase
    .from('custom_labels')
    .upsert({ kind, name, space, updated_at: new Date().toISOString() }, { onConflict: 'kind,name,space' });
  return !error;
}

async function pushLabelDeletion(kind, name, space) {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const { error } = await supabase.from('custom_labels').delete().eq('kind', kind).eq('name', name).eq('space', space);
  return !error;
}

export function pushCustomCategory(spaceKey, name) {
  return pushLabel('category', name, spaceKey);
}
export function pushCustomCategoryDeletion(spaceKey, name) {
  return pushLabelDeletion('category', name, spaceKey);
}
export function pushCustomTag(name) {
  return pushLabel('tag', name, '');
}

// Se puede llamar seguido (después de loguearse, o con el botón 🔄 de la
// biblioteca). `changed: true` avisa a quien llamó que hay que volver a
// pintar la pantalla (apareció alguna carpeta o tiempo nuevo).
export async function syncLabelsNow() {
  if (!isSupabaseConfigured) return { synced: false, reason: 'not-configured' };
  const session = await getSession();
  if (!session) return { synced: false, reason: 'not-logged-in' };

  try {
    const spaceKey = getCurrentSpaceKey();
    const { data, error } = await supabase.from('custom_labels').select('kind, name, space');
    if (error) throw error;

    let changed = false;
    // Carpetas: solo las de ESTA parroquia. Tiempos/temas: todos (siempre
    // viajan con space vacío, compartidos).
    const remoteCategories = data.filter((row) => row.kind === 'category' && row.space === spaceKey).map((row) => row.name);
    const remoteTags = data.filter((row) => row.kind === 'tag').map((row) => row.name);

    const localCategories = getCustomCategories(spaceKey);
    for (const name of remoteCategories) {
      if (!localCategories.includes(name)) {
        addCustomCategory(spaceKey, name);
        changed = true;
      }
    }
    for (const name of localCategories) {
      if (!remoteCategories.includes(name)) await pushLabel('category', name, spaceKey);
    }

    const localTags = getCustomTags();
    for (const name of remoteTags) {
      if (!localTags.includes(name)) {
        addCustomTag(name);
        changed = true;
      }
    }
    for (const name of localTags) {
      if (!remoteTags.includes(name)) await pushLabel('tag', name, '');
    }

    return { synced: true, changed };
  } catch (error) {
    const reason = error?.code === '42501' ? 'not-authorized' : 'error';
    return { synced: false, reason, error };
  }
}
