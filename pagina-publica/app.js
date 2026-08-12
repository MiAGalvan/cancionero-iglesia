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

// Cada parroquia tiene su propio QR, que apunta a esta misma página con
// ?space=algo en la URL (ver app-equipo/src/views/qrView.js). El nombre
// para mostrar ("Nombre — Localidad, Provincia") viaja ya armado en cada
// fila publicada (columna space_name) — así, si se agrega una parroquia
// nueva desde la app, esta página la muestra bien sin que haga falta
// tocarle el código. Este mapa es solo para el caso de "todavía no se
// publicó nada" (no hay ninguna fila de la que sacar el nombre).
const SPACE_LABELS_DE_ARRANQUE = {
  merced: 'Nuestra Señora de la Merced',
  'maria-auxiliadora': 'María Auxiliadora',
  general: 'General (misas conjuntas)',
};
const space = new URLSearchParams(window.location.search).get('space') || 'merced';

const app = document.getElementById('app');

const isConfigured = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function cargarYMostrar() {
  if (!isConfigured) {
    app.innerHTML = `<p class="error">Falta configurar Supabase en app.js (SUPABASE_URL / SUPABASE_ANON_KEY).</p>`;
    return;
  }

  const [listaResult, anunciosResult] = await Promise.all([
    supabase
      .from('lista_actual')
      .select('fecha, items, space_name')
      .eq('space', space)
      .order('updated_at', { ascending: false })
      .limit(1),
    // Si la tabla `anuncios` todavía no existe (falta correr la migración),
    // esto da error — no es grave, la página igual muestra los cantos.
    supabase.from('anuncios').select('titulo, cuerpo').eq('space', space).order('updated_at', { ascending: false }),
  ]);

  const { data, error } = listaResult;
  const anuncios = anunciosResult.error ? [] : anunciosResult.data;

  if (error) {
    app.innerHTML = `<p class="error">No se pudo cargar la lista. Revisá tu conexión.</p>`;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    app.innerHTML = `
      <p class="empty">Todavía no se publicó ninguna lista para ${escapeHtml(
        SPACE_LABELS_DE_ARRANQUE[space] || space
      )}.</p>
      ${renderNovedades(anuncios)}
    `;
    return;
  }

  render(data[0], anuncios);
}

function render({ fecha, items, space_name }, anuncios) {
  app.innerHTML = `
    <h1>Cantos de la misa</h1>
    <p class="parroquia">${escapeHtml(space_name || SPACE_LABELS_DE_ARRANQUE[space] || space)}</p>
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
    ${renderNovedades(anuncios)}
  `;
}

function renderNovedades(anuncios) {
  if (!anuncios || anuncios.length === 0) return '';
  return `
    <section class="novedades">
      <h2 class="novedades-titulo">Novedades</h2>
      ${anuncios
        .map(
          (anuncio) => `
        <article class="novedad">
          <h3 class="novedad-titulo">${escapeHtml(anuncio.titulo)}</h3>
          <p class="novedad-cuerpo">${escapeHtml(anuncio.cuerpo)}</p>
        </article>`
        )
        .join('')}
    </section>
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
