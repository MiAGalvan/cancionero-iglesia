// Cliente de Supabase, usado SOLO para publicar la lista de la misa (y para
// el login del equipo). El resto de la app (cancionero, visor, listas)
// nunca toca esto y sigue andando sin internet.
//
// ⚠️ COMPLETAR ANTES DE USAR "Publicar":
// 1. Entrá a tu proyecto en https://supabase.com/dashboard
// 2. Settings → API → copiá "Project URL" y "anon public" key
// 3. Pegalas acá abajo (la anon key NO es secreta: está pensada para vivir en
//    el código del frontend, la seguridad real la da RLS en la base de datos,
//    ver supabase/schema.sql).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mfmlbykzraejkcrdkjpw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbWxieWt6cmFlamtjcmRranB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDUyMTAsImV4cCI6MjEwMDY4MTIxMH0.qb8QMD6zEy-Pk182-Q0qKa_EVwIMQTEw6KYiJhm77SM';

export const isSupabaseConfigured =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');

// persistSession (default true) guarda la sesión en localStorage: por eso,
// si el usuario se loguea con internet y después abre la tablet sin señal,
// la sesión guardada sigue siendo válida — no hace falta código extra para
// "no pedir login de nuevo offline", supabase-js ya lo resuelve.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
