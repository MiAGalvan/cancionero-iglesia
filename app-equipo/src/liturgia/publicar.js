// Arma el contenido público de una lista de misa (sin acordes) y lo sube a
// Supabase. Los acordes y la estructura de notas NUNCA salen de este
// dispositivo: acá solo se manda título + letra en texto plano.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSong } from '../storage/db.js';
import { getSession } from '../storage/auth.js';
import { getAllCategories, getSpaceFullLabel, getDeviceGroup } from '../storage/settings.js';
import { chordProToPlainLyrics } from './textoPlano.js';

// `misa.items` es { [categoria]: songId | null }. Devuelve solo las
// categorías que tienen canción elegida, en el orden litúrgico fijo (más
// las carpetas agregadas por el equipo, al final de ese orden).
export async function buildPublishPayload(misa) {
  const items = [];
  for (const categoria of getAllCategories()) {
    const songId = misa.items[categoria];
    if (!songId) continue;
    const song = await getSong(songId);
    if (!song) continue;
    items.push({
      categoria,
      titulo_cancion: song.title,
      letra_sin_acordes: chordProToPlainLyrics(song.chordpro),
      // El uuid no es información sensible (ya viaja entre dispositivos del
      // equipo por la sincronización normal) y la página pública del QR no
      // lo usa para nada — solo sirve para que "Ver publicada", adentro de
      // la app, pueda linkear directo a la canción con acordes si la
      // encuentra en el cancionero local (ver listaPublicadaView.js).
      song_uuid: song.uuid,
    });
  }
  return items;
}

// Requiere sesión iniciada: si no hay sesión, Supabase rechaza el insert por
// RLS (ver supabase/schema.sql) aunque este código igual intentara mandarlo.
export async function publishMisa(misa) {
  if (!isSupabaseConfigured) {
    throw new Error('Falta configurar Supabase en src/storage/supabaseClient.js');
  }
  const [items, session] = await Promise.all([buildPublishPayload(misa), getSession()]);
  const { error } = await supabase.from('lista_actual').upsert(
    {
      space: misa.space,
      space_name: getSpaceFullLabel(misa.space),
      fecha: misa.fecha,
      items,
      // El grupo del dispositivo (ej. "CORO SÁBADO") es más útil que el
      // email cuando varios grupos comparten un solo login de parroquia —
      // si no está configurado, se usa el email como respaldo.
      published_by: getDeviceGroup() || session?.user?.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'space,fecha' }
  );
  if (error) throw error;
}

// "Publicar" saca una FOTO de la letra en ese momento — si después se
// corrige la canción en el cancionero, esa corrección no le llega sola a la
// lista ya publicada (a propósito: evita subir algo a medio escribir cada
// vez que se guarda). Esto es el atajo para cuando SÍ hace falta que
// llegue ya mismo (un error que se nota en el momento, durante la misa):
// busca la lista publicada más reciente de la parroquia de esta canción y
// le actualiza SOLO el/los renglones de esta canción puntual (matcheando
// por uuid), sin tocar el resto de la lista.
export async function updatePublishedSong(song) {
  if (!isSupabaseConfigured) {
    throw new Error('Falta configurar Supabase en src/storage/supabaseClient.js');
  }
  const { data, error: fetchError } = await supabase
    .from('lista_actual')
    .select('fecha, items')
    .eq('space', song.space)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (fetchError) throw fetchError;
  if (!data || data.length === 0) return { updated: false };

  const { fecha, items } = data[0];
  let matched = false;
  const updatedItems = items.map((item) => {
    if (item.song_uuid !== song.uuid) return item;
    matched = true;
    return { ...item, titulo_cancion: song.title, letra_sin_acordes: chordProToPlainLyrics(song.chordpro) };
  });
  if (!matched) return { updated: false };

  const session = await getSession();
  const { error } = await supabase.from('lista_actual').upsert(
    {
      space: song.space,
      space_name: getSpaceFullLabel(song.space),
      fecha,
      items: updatedItems,
      published_by: getDeviceGroup() || session?.user?.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'space,fecha' }
  );
  if (error) throw error;
  return { updated: true };
}
