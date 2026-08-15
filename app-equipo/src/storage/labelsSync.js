// Sincroniza entre dispositivos las carpetas agregadas y los tiempos/temas
// litúrgicos agregados (ver storage/settings.js) — a diferencia del
// cancionero o las parroquias, no son datos "de una parroquia" sino
// compartidos por toda la app, así que cualquier integrante logueado los
// puede leer y agregar.
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
import { getCustomCategories, addCustomCategory, getCustomTags, addCustomTag } from './settings.js';

async function pushLabel(kind, name) {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const { error } = await supabase
    .from('custom_labels')
    .upsert({ kind, name, updated_at: new Date().toISOString() }, { onConflict: 'kind,name' });
  return !error;
}

async function pushLabelDeletion(kind, name) {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const { error } = await supabase.from('custom_labels').delete().eq('kind', kind).eq('name', name);
  return !error;
}

export function pushCustomCategory(name) {
  return pushLabel('category', name);
}
export function pushCustomCategoryDeletion(name) {
  return pushLabelDeletion('category', name);
}
export function pushCustomTag(name) {
  return pushLabel('tag', name);
}

// Se puede llamar seguido (después de loguearse, o con el botón 🔄 de la
// biblioteca). `changed: true` avisa a quien llamó que hay que volver a
// pintar la pantalla (apareció alguna carpeta o tiempo nuevo).
export async function syncLabelsNow() {
  if (!isSupabaseConfigured) return { synced: false, reason: 'not-configured' };
  const session = await getSession();
  if (!session) return { synced: false, reason: 'not-logged-in' };

  try {
    const { data, error } = await supabase.from('custom_labels').select('kind, name');
    if (error) throw error;

    let changed = false;
    const remoteCategories = data.filter((row) => row.kind === 'category').map((row) => row.name);
    const remoteTags = data.filter((row) => row.kind === 'tag').map((row) => row.name);

    const localCategories = getCustomCategories();
    for (const name of remoteCategories) {
      if (!localCategories.includes(name)) {
        addCustomCategory(name);
        changed = true;
      }
    }
    for (const name of localCategories) {
      if (!remoteCategories.includes(name)) await pushLabel('category', name);
    }

    const localTags = getCustomTags();
    for (const name of remoteTags) {
      if (!localTags.includes(name)) {
        addCustomTag(name);
        changed = true;
      }
    }
    for (const name of localTags) {
      if (!remoteTags.includes(name)) await pushLabel('tag', name);
    }

    return { synced: true, changed };
  } catch (error) {
    const reason = error?.code === '42501' ? 'not-authorized' : 'error';
    return { synced: false, reason, error };
  }
}
