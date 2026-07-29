// Página pública de solo lectura: sin build, se sirve tal cual desde
// GitHub Pages. Trae supabase-js desde un CDN (esm.sh) en vez de instalarlo
// con npm, para no necesitar ningún paso de compilación.
//
// ⚠️ COMPLETAR (ver /supabase/SETUP.md paso 3): pegar acá la URL y la anon
// key de tu proyecto Supabase. La anon key no es secreta — solo puede leer
// (RLS lo garantiza del lado del servidor), nunca escribir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://mfmlbykzraejkcrdkjpw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbWxieWt6cmFlamtjcmRranB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDUyMTAsImV4cCI6MjEwMDY4MTIxMH0.qb8QMD6zEy-Pk182-Q0qKa_EVwIMQTEw6KYiJhm77SM';

const REFRESH_MS = 45000; // cada cuánto se refresca sola, por si publican un cambio de último momento

const app = document.getElementById('app');

const isConfigured = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function cargarYMostrar() {
  if (!isConfigured) {
    app.innerHTML = `<p class="error">Falta configurar Supabase en app.js (SUPABASE_URL / SUPABASE_ANON_KEY).</p>`;
    return;
  }

  const { data, error } = await supabase
    .from('lista_actual')
    .select('fecha, items')
    .order('fecha', { ascending: false })
    .limit(1);

  if (error) {
    app.innerHTML = `<p class="error">No se pudo cargar la lista. Revisá tu conexión.</p>`;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    app.innerHTML = `<p class="empty">Todavía no se publicó ninguna lista.</p>`;
    return;
  }

  render(data[0]);
}

function render({ fecha, items }) {
  app.innerHTML = `
    <h1>Cantos de la misa</h1>
    <p class="fecha">${formatFecha(fecha)}</p>
    ${items
      .map(
        (item) => `
      <section class="cancion">
        <h2 class="categoria">${escapeHtml(item.categoria)}</h2>
        <h3 class="titulo">${escapeHtml(item.titulo_cancion)}</h3>
        <p class="letra">${escapeHtml(item.letra_sin_acordes)}</p>
      </section>`
      )
      .join('')}
  `;
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

cargarYMostrar();
setInterval(cargarYMostrar, REFRESH_MS);
