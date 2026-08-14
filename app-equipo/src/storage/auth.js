// Login del equipo (Supabase Auth, email + contraseña). Esto es lo único que
// distingue "equipo" de "público" de verdad: la base de datos rechaza
// escrituras sin sesión, sin importar lo que se intente desde el navegador
// (ver supabase/schema.sql). Acá solo envolvemos las llamadas más simples.
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

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
