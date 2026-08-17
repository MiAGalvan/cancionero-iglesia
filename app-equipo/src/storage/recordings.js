// Sube y consulta las grabaciones de audio de cada canción (cómo la canta
// cada grupo/parroquia), usando Supabase Storage (bucket "grabaciones" —
// hay que crearlo a mano una vez en el dashboard, ver supabase/SETUP.md)
// más una tabla chica (`song_recordings`) con la referencia.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getSession } from './auth.js';

const BUCKET = 'grabaciones';

// Convierte el nombre del grupo (ej. "SÁBADO 19HS") en algo seguro para
// usar como carpeta: sin tildes, sin espacios ni caracteres raros.
const COMBINING_MARKS = new RegExp('[̀-ͯ]', 'g');

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

// La MISMA combinación espacio+grupo+canción siempre da la MISMA ruta y el
// MISMO id de fila: volver a grabar la reemplaza en vez de duplicarla (ver
// supabase/schema.sql).
function buildKey(spaceKey, groupName, songUuid) {
  const groupSlug = slugify(groupName) || 'SIN-GRUPO';
  return {
    id: `${spaceKey}|${groupSlug}|${songUuid}`,
    storagePath: `${spaceKey}/${groupSlug}/${songUuid}.webm`,
  };
}

export async function uploadSongRecording({ spaceKey, spaceName, groupName, songUuid, songTitle, blob }) {
  if (!isSupabaseConfigured) throw new Error('Falta configurar Supabase.');
  const session = await getSession();
  if (!session) throw new Error('Hace falta estar logueado para grabar.');

  const { id, storagePath } = buildKey(spaceKey, groupName, songUuid);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { upsert: true, contentType: blob.type || 'audio/webm' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  // Igual que con los logos: la ruta no cambia al volver a grabar, así que
  // sin este parámetro el navegador podría seguir mostrando (cacheado) el
  // audio viejo en vez del nuevo.
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await supabase.from('song_recordings').upsert(
    {
      id,
      space: spaceKey,
      space_name: spaceName,
      group_name: groupName || 'Sin grupo',
      song_uuid: songUuid,
      song_title: songTitle,
      storage_path: storagePath,
      recorded_by: groupName || session.user.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (dbError) throw dbError;

  return url;
}

// Todas las grabaciones de una canción (de cualquier parroquia), para
// mostrar en Compartidas. `song_uuid` es el mismo en todas las copias de
// una canción compartida (ver compartidasView.js), así que esto encuentra
// grabaciones aunque la canción ya se haya copiado a otro cancionero.
export async function getRecordingsForSong(songUuid) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('song_recordings')
    .select('space_name, group_name, storage_path, updated_at')
    .eq('song_uuid', songUuid)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    spaceName: row.space_name,
    groupName: row.group_name,
    url: supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
    updatedAt: row.updated_at,
  }));
}
