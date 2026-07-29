// Arma el contenido público de una lista de misa (sin acordes) y lo sube a
// Supabase. Los acordes y la estructura de notas NUNCA salen de este
// dispositivo: acá solo se manda título + letra en texto plano.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSong } from '../storage/db.js';
import { getAllCategories } from '../storage/settings.js';
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
  const items = await buildPublishPayload(misa);
  const { error } = await supabase.from('lista_actual').upsert(
    { space: misa.space, fecha: misa.fecha, items, updated_at: new Date().toISOString() },
    { onConflict: 'space,fecha' }
  );
  if (error) throw error;
}
