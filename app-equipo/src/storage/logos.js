// Sube y consulta el logo de cada parroquia/capilla, usando Supabase
// Storage (bucket "logos" — hay que crearlo a mano una vez en el dashboard,
// ver supabase/SETUP.md) más una tabla chica (`espacio_logos`) que guarda
// la URL pública, para que la página del QR la pueda leer sin depender de
// la API de Storage. Siempre se guarda en la MISMA ruta por parroquia
// ("{space}/logo", con upsert), así una foto nueva reemplaza a la anterior
// en vez de ir acumulando archivos sueltos.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const BUCKET = 'logos';

export async function uploadSpaceLogo(spaceKey, file) {
  if (!isSupabaseConfigured) throw new Error('Falta configurar Supabase.');
  const path = `${spaceKey}/logo`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // La ruta del archivo no cambia al reemplazar el logo, así que le
  // agregamos la hora como parámetro: sin esto, un dispositivo que ya
  // había visto el logo viejo seguiría mostrando esa versión cacheada en
  // vez de bajar la nueva, porque para el navegador sería "la misma" URL.
  const logoUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await supabase
    .from('espacio_logos')
    .upsert({ space: spaceKey, logo_url: logoUrl, updated_at: new Date().toISOString() }, { onConflict: 'space' });
  if (dbError) throw dbError;

  return logoUrl;
}

export async function getSpaceLogoUrl(spaceKey) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from('espacio_logos').select('logo_url').eq('space', spaceKey).maybeSingle();
  if (error || !data) return null;
  return data.logo_url;
}

// Para pantallas que necesitan el logo de varias parroquias a la vez (ej.
// "Parroquias y capillas"), en una sola consulta en vez de una por fila.
export async function getLogosForSpaces(spaceKeys) {
  if (!isSupabaseConfigured || spaceKeys.length === 0) return {};
  const { data, error } = await supabase.from('espacio_logos').select('space, logo_url').in('space', spaceKeys);
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.space, row.logo_url]));
}
