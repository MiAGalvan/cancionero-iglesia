// Arma el contenido público de una lista de misa (sin acordes) y lo sube a
// Supabase. Los acordes y la estructura de notas NUNCA salen de este
// dispositivo: acá solo se manda título + letra en texto plano.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSong, getSongByUuid, getMisa, saveMisa } from '../storage/db.js';
import { syncMisasNow } from '../storage/misasSync.js';
import { getSession } from '../storage/auth.js';
import { getAllCategories, getSpaceFullLabel, getDeviceGroup } from '../storage/settings.js';
import { chordProToPlainLyrics } from './textoPlano.js';

// `misa.items` es { [categoria]: songId[] } — puede haber más de una
// canción por categoría (ej. dos cantos de Comunión seguidos), quedan en
// el orden en que se agregaron. En misas guardadas antes de que existiera
// esto, `misa.items[categoria]` es un solo songId o null; se admite igual,
// sin necesidad de migrar nada ya guardado. Devuelve solo las canciones
// elegidas, en el orden litúrgico fijo de categorías (más las carpetas
// agregadas por el equipo, al final de ese orden).
export async function buildPublishPayload(misa) {
  const items = [];
  for (const categoria of getAllCategories(misa.space)) {
    const valor = misa.items[categoria];
    const songIds = Array.isArray(valor) ? valor : valor ? [valor] : [];
    for (const songId of songIds) {
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
      hora: misa.hora || '',
      items,
      // El grupo del dispositivo (ej. "CORO SÁBADO") es más útil que el
      // email cuando varios grupos comparten un solo login de parroquia —
      // si no está configurado, se usa el email como respaldo.
      published_by: getDeviceGroup() || session?.user?.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'space,fecha,hora' }
  );
  if (error) throw error;
}

// Cambia UNA canción de una lista ya publicada por otra del cancionero, sin
// pasar por "armar la lista de nuevo y volver a publicar" (ver el botón
// "Cambiar" en views/listaPublicadaView.js). Vuelve a leer la fila ANTES de
// escribir, para no pisar con datos viejos si alguien más del equipo publicó
// algo en el medio, y ubica la canción por su uuid (o por título, en listas
// publicadas antes de que existiera el uuid) en vez de por la posición. Deja
// la misma categoría y el mismo lugar en la lista. Además corrige la lista
// guardada en este dispositivo (y la sincroniza) para que la próxima vez que
// se abra "Lista de misa" no vuelva a aparecer la canción vieja.
export async function cambiarCancionPublicada({ space, fecha, hora, anterior, song }) {
  if (!isSupabaseConfigured) {
    throw new Error('Falta configurar Supabase en src/storage/supabaseClient.js');
  }
  const { data: fila, error: fetchError } = await supabase
    .from('lista_actual')
    .select('items')
    .eq('space', space)
    .eq('fecha', fecha)
    .eq('hora', hora || '')
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!fila) throw new Error('LISTA_YA_NO_EXISTE');

  const posicion = fila.items.findIndex((item) =>
    anterior.song_uuid ? item.song_uuid === anterior.song_uuid : item.titulo_cancion === anterior.titulo_cancion
  );
  if (posicion < 0) throw new Error('CANCION_YA_CAMBIADA');

  const items = fila.items.map((item, i) =>
    i === posicion
      ? {
          categoria: item.categoria,
          titulo_cancion: song.title,
          letra_sin_acordes: chordProToPlainLyrics(song.chordpro),
          song_uuid: song.uuid,
        }
      : item
  );

  const session = await getSession();
  const { error } = await supabase.from('lista_actual').upsert(
    {
      space,
      space_name: getSpaceFullLabel(space),
      fecha,
      hora: hora || '',
      items,
      published_by: getDeviceGroup() || session?.user?.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'space,fecha,hora' }
  );
  if (error) throw error;

  // La parte local es "lo mejor posible": lo publicado ya quedó bien, así
  // que si esto falla no se deshace nada ni se le avisa como error.
  try {
    await reemplazarEnMisaLocal({ space, fecha, hora, categoria: fila.items[posicion].categoria, anterior, song });
  } catch (err) {
    console.error(err);
  }
  return { items };
}

async function reemplazarEnMisaLocal({ space, fecha, hora, categoria, anterior, song }) {
  const misa = await getMisa(space, fecha, hora || '');
  if (!misa) return;
  const valor = misa.items?.[categoria];
  const ids = Array.isArray(valor) ? [...valor] : valor ? [valor] : [];
  const anteriorLocal = anterior.song_uuid ? await getSongByUuid(anterior.song_uuid) : null;
  const indice = anteriorLocal ? ids.indexOf(anteriorLocal.id) : -1;
  if (indice < 0) return;
  ids[indice] = song.id;
  await saveMisa(space, fecha, hora || '', { ...misa.items, [categoria]: ids });
  syncMisasNow();
}

// "Publicar" saca una FOTO de la letra en ese momento — si después se
// corrige la canción en el cancionero, esa corrección no le llega sola a la
// lista ya publicada (a propósito: evita subir algo a medio escribir cada
// vez que se guarda). Esto es el atajo para cuando SÍ hace falta que
// llegue ya mismo (un error que se nota en el momento, durante la misa):
// busca las listas publicadas más recientes de la parroquia de esta
// canción y le actualiza SOLO el/los renglones de esta canción puntual
// (matcheando por uuid) en CADA UNA donde aparezca, sin tocar el resto —
// con horarios separados, la misma canción puede estar publicada a la vez
// en más de una lista del mismo día (ej. 12hs y 19hs).
export async function updatePublishedSong(song) {
  if (!isSupabaseConfigured) {
    throw new Error('Falta configurar Supabase en src/storage/supabaseClient.js');
  }
  const { data, error: fetchError } = await supabase
    .from('lista_actual')
    .select('fecha, hora, items')
    .eq('space', song.space)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (fetchError) throw fetchError;
  if (!data || data.length === 0) return { updated: false };

  const session = await getSession();
  let updated = false;
  for (const fila of data) {
    let matched = false;
    const updatedItems = fila.items.map((item) => {
      if (item.song_uuid !== song.uuid) return item;
      matched = true;
      return { ...item, titulo_cancion: song.title, letra_sin_acordes: chordProToPlainLyrics(song.chordpro) };
    });
    if (!matched) continue;

    const { error } = await supabase.from('lista_actual').upsert(
      {
        space: song.space,
        space_name: getSpaceFullLabel(song.space),
        fecha: fila.fecha,
        hora: fila.hora,
        items: updatedItems,
        published_by: getDeviceGroup() || session?.user?.email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'space,fecha,hora' }
    );
    if (error) throw error;
    updated = true;
  }
  return { updated };
}
