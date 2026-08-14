// Login del equipo (Supabase Auth, email + contraseña). Esto es lo único que
// distingue "equipo" de "público" de verdad: la base de datos rechaza
// escrituras sin sesión, sin importar lo que se intente desde el navegador
// (ver supabase/schema.sql). Acá solo envolvemos las llamadas más simples.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { getSpaces } from './settings.js';

export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Falta configurar Supabase en src/storage/supabaseClient.js');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

// Sesión actual, leída del cliente de supabase-js (que a su vez la persiste
// en localStorage). Devuelve null si no hay sesión o si Supabase no está
// configurado todavía.
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// true si la sesión actual es de un admin (acceso a todas las parroquias,
// ver team_members en supabase/schema.sql). false tanto si no hay sesión
// como si es un integrante normal (restringido a sus propias parroquias).
export async function isAdmin() {
  if (!isSupabaseConfigured) return false;
  const session = await getSession();
  if (!session) return false;
  const { data } = await supabase
    .from('team_members')
    .select('is_admin')
    .eq('user_id', session.user.id)
    .maybeSingle();
  return Boolean(data?.is_admin);
}

// Devuelve las keys de parroquia que puede TOCAR el usuario logueado, o
// `null` si no hay que restringir nada (sin sesión — uso offline normal,
// o admin — acceso a todo). Se usa para que el selector de parroquias de
// cada pantalla solo muestre lo que a ese usuario le corresponde, en vez
// de mostrar todas y recién rechazar el guardado/la publicación después.
export async function getAllowedSpaceKeys() {
  if (!isSupabaseConfigured) return null;
  const session = await getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('team_members')
    .select('is_admin, spaces')
    .eq('user_id', session.user.id)
    .maybeSingle();
  // Sin fila en team_members todavía (cuenta recién creada, falta
  // asignarle parroquia): no restringimos la UI — igual el servidor va a
  // rechazar cualquier intento de guardar o publicar, por las políticas
  // de RLS (ver supabase/schema.sql).
  if (!data) return null;
  if (data.is_admin) return null;
  return data.spaces || [];
}

// La lista de "Parroquias y capillas" ya filtrada según lo que el usuario
// actual puede tocar. Nunca devuelve una lista vacía (si el filtro dejara
// cero resultados por algún dato inconsistente, mejor mostrar todas que
// dejar la pantalla sin ninguna opción).
export async function getVisibleSpaces() {
  const allowedKeys = await getAllowedSpaceKeys();
  if (!allowedKeys) return getSpaces();
  const filtered = getSpaces().filter((space) => allowedKeys.includes(space.key));
  return filtered.length > 0 ? filtered : getSpaces();
}

// Se dispara cuando cambia el estado de login (login, logout, refresh de
// token). Útil para actualizar botones ("Publicar") en cualquier pantalla
// abierta sin tener que recargar la página.
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return { unsubscribe() {} };
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return subscription;
}
