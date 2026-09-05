// Cancionero de una parroquia, leído directo de Supabase sin necesitar
// sesión — para que cualquiera del equipo/coro pueda buscar y ver letra +
// acordes desde un celular que nunca inició sesión, sin tener que loguearse
// solo para MIRAR. El cancionero local de siempre (ver storage/db.js) sigue
// exactamente igual: guardado en el dispositivo, requiere login para
// sincronizar, funciona offline una vez sincronizado — esto es aparte, de
// solo lectura, no toca IndexedDB para nada.
//
// Solo trae canciones con shared=true: las que un equipo marcó a propósito
// como "no compartir" (poco frecuente, se destilda una por una en cada
// canción) quedan afuera de este modo sin cuenta — mismo límite que ya
// existe hoy para que OTRAS parroquias las vean en "Biblioteca compartida".
// Necesita la política de Supabase de supabase/migracion-lectura-publica-
// cancionero.sql corrida una vez (RLS: sin eso, esto devuelve siempre
// vacío, no error).
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const SELECT_COLUMNAS = 'uuid, title, artist, categories, chordpro, tags';

export async function getPublicSongsForSpace(spaceKey) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('songs')
    .select(SELECT_COLUMNAS)
    .eq('space', spaceKey)
    .eq('shared', true)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  if (error) {
    console.error('No se pudo leer el cancionero público:', error);
    return [];
  }
  return data || [];
}

export async function getPublicSongByUuid(uuid) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('songs')
    .select(SELECT_COLUMNAS)
    .eq('uuid', uuid)
    .eq('shared', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('No se pudo leer la canción pública:', error);
    return null;
  }
  return data;
}
