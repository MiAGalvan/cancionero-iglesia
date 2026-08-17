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

// Traducción automática para turistas: nadie del equipo tiene que cargar
// nada a mano. Al tocar PT o EN, se le pide la traducción a Google
// Translate (el mismo servicio gratuito que usan los navegadores) desde acá
// mismo, y se cachea en memoria para no volver a pedirla si se toca el
// botón de nuevo. Es un endpoint no oficial (sin API key, gratis, el mismo
// que usan muchas extensiones de traducción) — funciona bien en la
// práctica, pero al no ser una API con contrato firme, si algún día Google
// lo bloquea, la página se queda mostrando español en vez de romperse.
const LANGS = { es: 'Español', pt: 'Português', en: 'English' };
const LANG_KEY = 'cancionero-iglesia:lang';
let lang = localStorage.getItem(LANG_KEY) in LANGS ? localStorage.getItem(LANG_KEY) : 'es';

const translationCache = new Map(); // clave: "idioma::texto original" -> texto traducido

async function translateText(text, targetLang) {
  if (!text) return text;
  const key = `${targetLang}::${text}`;
  if (translationCache.has(key)) return translationCache.get(key);

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=${targetLang}&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo traducir');
  const data = await res.json();
  const translated = data[0].map((chunk) => chunk[0]).join('');
  translationCache.set(key, translated);
  return translated;
}

// Los nombres de las 12 categorías litúrgicas fijas son siempre los mismos,
// así que se pueden traducir con un diccionario fijo (instantáneo, sin
// depender de la red) en vez de pedirlos a Google cada vez. Una carpeta
// agregada a mano por una parroquia en particular no está acá: se traduce
// igual que el resto (por Google), no queda sin traducir.
const CATEGORY_LABELS = {
  ENTRADA: { pt: 'Entrada', en: 'Entrance' },
  KYRIE: { pt: 'Kyrie', en: 'Kyrie' },
  'PERDÓN': { pt: 'Ato Penitencial', en: 'Penitential Act' },
  'ENTRADA DE LA PALABRA': { pt: 'Entrada da Palavra', en: 'Entrance of the Word' },
  GLORIA: { pt: 'Glória', en: 'Gloria' },
  ALELUYA: { pt: 'Aleluia', en: 'Alleluia' },
  OFERTORIO: { pt: 'Ofertório', en: 'Offertory' },
  SANTO: { pt: 'Santo', en: 'Holy' },
  CORDERO: { pt: 'Cordeiro de Deus', en: 'Lamb of God' },
  'COMUNIÓN': { pt: 'Comunhão', en: 'Communion' },
  'MEDITACIÓN': { pt: 'Meditação', en: 'Meditation' },
  SALIDA: { pt: 'Saída', en: 'Sending Forth' },
};

const UI_TEXT = {
  es: { titulo: 'Cantos de la misa', avisoError: '' },
  pt: { titulo: 'Cânticos da missa', avisoError: '(não foi possível traduzir esta parte)' },
  en: { titulo: 'Songs of the Mass', avisoError: '(this part could not be translated)' },
};

async function categoriaLabel(categoria) {
  if (lang === 'es') return categoria;
  return CATEGORY_LABELS[categoria]?.[lang] || translateText(categoria, lang);
}

function renderLangSwitcher() {
  return `
    <div class="lang-switcher">
      ${Object.keys(LANGS)
        .map(
          (code) => `<button type="button" class="lang-btn${code === lang ? ' active' : ''}" data-lang="${code}">${code.toUpperCase()}</button>`
        )
        .join('')}
    </div>
  `;
}

const isConfigured = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Se guarda lo último que se trajo de Supabase para poder cambiar de idioma
// (re-renderizar) sin tener que pedirlo de nuevo a la red.
let ultimaData = null;
let ultimosAnuncios = [];
let ultimoLogoUrl = null;

async function cargarYMostrar() {
  if (!isConfigured) {
    app.innerHTML = `<p class="error">Falta configurar Supabase en app.js (SUPABASE_URL / SUPABASE_ANON_KEY).</p>`;
    return;
  }

  const [listaResult, anunciosResult, logoResult] = await Promise.all([
    supabase
      .from('lista_actual')
      .select('fecha, items, space_name')
      .eq('space', space)
      .order('updated_at', { ascending: false })
      .limit(1),
    // Si la tabla `anuncios` (o `espacio_logos`, más abajo) todavía no
    // existe porque falta correr la migración, esto da error — no es
    // grave, la página igual muestra los cantos.
    supabase.from('anuncios').select('titulo, cuerpo').eq('space', space).order('updated_at', { ascending: false }),
    supabase.from('espacio_logos').select('logo_url').eq('space', space).maybeSingle(),
  ]);

  const { data, error } = listaResult;
  const anuncios = anunciosResult.error ? [] : anunciosResult.data;
  const logoUrl = logoResult.error ? null : logoResult.data?.logo_url || null;

  if (error) {
    app.innerHTML = `<p class="error">No se pudo cargar la lista. Revisá tu conexión.</p>`;
    console.error(error);
    return;
  }

  ultimaData = data && data.length > 0 ? data[0] : null;
  ultimosAnuncios = anuncios;
  ultimoLogoUrl = logoUrl;
  renderTodo();
}

// A diferencia de cargarYMostrar (que pide datos nuevos), esto solo vuelve
// a pintar la pantalla con lo último que ya se trajo — se usa al tocar un
// botón de idioma, para que sea instantáneo y no dependa de pedir de nuevo
// la lista de cantos (la traducción en sí sí necesita red, ver render()).
function renderTodo() {
  if (!ultimaData) {
    app.innerHTML = `
      ${renderBanner(ultimoLogoUrl)}
      ${renderLangSwitcher()}
      <p class="empty">Todavía no se publicó ninguna lista para ${escapeHtml(
        SPACE_LABELS_DE_ARRANQUE[space] || space
      )}.</p>
      ${renderNovedades(ultimosAnuncios)}
    `;
  } else {
    render(ultimaData, ultimosAnuncios, ultimoLogoUrl);
  }

  app.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lang = btn.dataset.lang;
      localStorage.setItem(LANG_KEY, lang);
      renderTodo();
    });
  });
}

function renderBanner(logoUrl) {
  if (!logoUrl) return '';
  return `
    <div class="parish-banner">
      <img src="${escapeHtml(logoUrl)}" alt="" />
    </div>
  `;
}

// Pinta primero todo en español (instantáneo, nunca depende de la red para
// lo esencial) y, si se eligió PT o EN, dispara en paralelo un pedido de
// traducción por cada título/letra/categoría — cada uno actualiza su propio
// pedacito de la pantalla apenas responde, sin bloquear a los demás. Si el
// servicio de traducción falla (sin red, o el endpoint no responde), ese
// texto puntual se queda en español con un aviso chico, en vez de romper
// toda la página.
function render({ fecha, items, space_name }, anuncios, logoUrl) {
  app.innerHTML = `
    ${renderBanner(logoUrl)}
    ${renderLangSwitcher()}
    <h1>${UI_TEXT[lang].titulo}</h1>
    <p class="parroquia">${escapeHtml(space_name || SPACE_LABELS_DE_ARRANQUE[space] || space)}</p>
    <p class="fecha">${formatFecha(fecha)}</p>
    ${items
      .map(
        (item, i) => `
      <section class="cancion">
        <h2 class="categoria" id="categoria-${i}">${escapeHtml(item.categoria)}</h2>
        <h3 class="titulo" id="titulo-${i}">${escapeHtml(item.titulo_cancion)}</h3>
        <p class="letra" id="letra-${i}">${escapeHtml(item.letra_sin_acordes)}</p>
      </section>`
      )
      .join('')}
    ${renderNovedades(anuncios)}
  `;

  if (lang === 'es') return;

  items.forEach((item, i) => {
    traducirYActualizar(`categoria-${i}`, categoriaLabel(item.categoria));
    traducirYActualizar(`titulo-${i}`, translateText(item.titulo_cancion, lang));
    traducirYActualizar(`letra-${i}`, translateText(item.letra_sin_acordes, lang));
  });
}

async function traducirYActualizar(elementId, translationPromise) {
  const langAlPedir = lang; // por si se cambia de idioma mientras esto está en vuelo
  try {
    const texto = await translationPromise;
    if (lang !== langAlPedir) return; // ya no aplica, se pidió otro idioma mientras tanto
    const el = document.getElementById(elementId);
    if (el) el.textContent = texto;
  } catch {
    if (lang !== langAlPedir) return;
    const el = document.getElementById(elementId);
    if (el && !el.dataset.avisoSinTraducir) {
      el.dataset.avisoSinTraducir = '1';
      el.insertAdjacentHTML('beforebegin', `<p class="letra-aviso">${UI_TEXT[lang].avisoError}</p>`);
    }
  }
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
