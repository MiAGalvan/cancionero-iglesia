// Página pública de solo lectura: sin build, se sirve tal cual desde
// GitHub Pages. Trae supabase-js desde un CDN (esm.sh) en vez de instalarlo
// con npm, para no necesitar ningún paso de compilación.
//
// Tres pantallas, con un router mínimo por hash (#/, #/inicio, #/lecturas):
// el QR sigue apuntando siempre a "" (Canciones, la letra publicada) para
// no romper ningún QR ya impreso — desde ahí, un botón al final lleva a
// "Inicio" (parroquia, próxima misa, dirección), que a su vez lleva a
// "Lecturas".
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

// --- Router mínimo: "" = Canciones (entrada del QR), "inicio", "lecturas" -
function currentRoute() {
  return (window.location.hash || '').replace(/^#\/?/, '');
}

// Conserva el ?space= al navegar entre pantallas de esta misma página.
function hrefTo(route) {
  return `?space=${encodeURIComponent(space)}${route ? `#/${route}` : ''}`;
}

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
// o de pantalla (re-renderizar) sin tener que pedirlo de nuevo a la red.
let ultimaData = null;
let ultimosAnuncios = [];
let ultimoLogoUrl = null;
let ultimoEspacio = null;

async function cargarYMostrar() {
  if (!isConfigured) {
    app.innerHTML = `<p class="error">Falta configurar Supabase en app.js (SUPABASE_URL / SUPABASE_ANON_KEY).</p>`;
    return;
  }

  const [listaResult, anunciosResult, logoResult, espacioResult] = await Promise.all([
    supabase
      .from('lista_actual')
      .select('fecha, items, space_name')
      .eq('space', space)
      .order('updated_at', { ascending: false })
      .limit(1),
    // Si la tabla `anuncios` (o `espacio_logos`/`spaces`, más abajo) todavía
    // no existe porque falta correr alguna migración, esto da error — no es
    // grave, la página igual muestra los cantos.
    supabase.from('anuncios').select('titulo, cuerpo, fecha').eq('space', space).order('updated_at', { ascending: false }),
    supabase.from('espacio_logos').select('logo_url').eq('space', space).maybeSingle(),
    supabase
      .from('spaces')
      .select('label, locality, province, address, next_mass, instagram, facebook, youtube, whatsapp')
      .eq('key', space)
      .maybeSingle(),
  ]);

  const { data, error } = listaResult;
  const anuncios = anunciosResult.error ? [] : anunciosResult.data;
  const logoUrl = logoResult.error ? null : logoResult.data?.logo_url || null;
  const espacio = espacioResult.error ? null : espacioResult.data;

  if (error) {
    app.innerHTML = `<p class="error">No se pudo cargar la lista. Revisá tu conexión.</p>`;
    console.error(error);
    return;
  }

  ultimaData = data && data.length > 0 ? data[0] : null;
  ultimosAnuncios = anuncios;
  ultimoLogoUrl = logoUrl;
  ultimoEspacio = espacio;
  renderTodo();
}

// A diferencia de cargarYMostrar (que pide datos nuevos), esto solo vuelve
// a pintar la pantalla con lo último que ya se trajo — se usa al tocar un
// botón de idioma o al cambiar de pantalla, para que sea instantáneo y no
// dependa de pedir de nuevo la lista de cantos.
function renderTodo() {
  const route = currentRoute();

  if (route === 'inicio') {
    renderInicio();
  } else if (route === 'lecturas') {
    renderLecturas();
  } else if (route === 'redes') {
    renderRedes();
  } else if (!ultimaData) {
    app.innerHTML = `
      ${renderBanner(ultimoLogoUrl)}
      ${renderLangSwitcher()}
      <p class="empty">Todavía no se publicó ninguna lista para ${escapeHtml(nombreParroquia())}.</p>
      ${renderNovedades(ultimosAnuncios)}
      ${renderEnteratePromo()}
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

function nombreParroquia() {
  return ultimoEspacio?.label || ultimaData?.space_name || SPACE_LABELS_DE_ARRANQUE[space] || space;
}

function renderBanner(logoUrl) {
  if (!logoUrl) return '';
  return `
    <div class="parish-banner">
      <img src="${escapeHtml(logoUrl)}" alt="" />
    </div>
  `;
}

// Al final de la lista de cantos, un empujoncito hacia la pantalla de
// Inicio — así alguien que escanea el QR por primera vez (y solo quería ver
// la letra en el momento) se entera de que existe algo más para volver a
// visitar después, sin que eso le tape lo que vino a buscar.
function renderEnteratePromo() {
  return `
    <div class="entrate-promo">
      <a class="entrate-btn" href="${hrefTo('inicio')}">🔔 Enterate de lo próximo</a>
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
function render({ fecha, items }, anuncios, logoUrl) {
  app.innerHTML = `
    ${renderBanner(logoUrl)}
    ${renderLangSwitcher()}
    <h1>${UI_TEXT[lang].titulo}</h1>
    <p class="parroquia">${escapeHtml(nombreParroquia())}</p>
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
    ${renderNovedades(separarLecturas(anuncios).otrosAvisos)}
    ${renderEnteratePromo()}
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

// Compara la fecha de la lista PUBLICADA contra hoy: mientras dura una
// misa, esa lista no cambia (es la misma desde que arrancó hasta que
// termina) — así que sirve como pista de si lo que se va a ver es de hoy
// ("en vivo"), quedó cargado de antes para una fecha futura, o es de una
// misa anterior (nada especial que avisar ahí, es el caso normal).
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Misma lógica de estado para cualquier fecha (lista de canciones o
// lecturas): "en vivo" si es la de hoy, "próximamente" si quedó cargada
// con anticipación para una fecha futura, sin nada especial que avisar si
// ya pasó (es el caso normal, la última que se cargó).
function estadoParaFecha(fecha) {
  if (!fecha) return null;
  const hoy = hoyIso();
  if (fecha === hoy) return { label: '🔴 En vivo hoy', clase: 'badge-en-vivo' };
  if (fecha > hoy) return { label: '🕓 Próximamente', clase: 'badge-proximamente' };
  return null;
}

function estadoLista() {
  return estadoParaFecha(ultimaData?.fecha);
}

function renderBadge() {
  const estado = estadoLista();
  return estado ? `<span class="estado-badge ${estado.clase}">${estado.label}</span>` : '';
}

// La fecha de "las lecturas" toma la del primer registro encontrado: las 4
// (1ª Lectura, Salmo, 2ª Lectura, Evangelio) se cargan juntas desde
// Novedades con la misma fecha, así que alcanza con mirar una.
function fechaLecturas() {
  return separarLecturas(ultimosAnuncios).lecturas[0]?.fecha || null;
}

function renderBadgeLecturas() {
  const estado = estadoParaFecha(fechaLecturas());
  return estado ? `<span class="estado-badge ${estado.clase}">${estado.label}</span>` : '';
}

function formatFechaLarga(fecha) {
  if (!fecha) return '';
  const texto = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// --- Pantalla de Inicio: "¿Vas a misa hoy?" ------------------------------
function renderInicio() {
  const lugar = [ultimoEspacio?.locality, ultimoEspacio?.province].filter(Boolean).join(', ');
  const proximaMisa = ultimoEspacio?.next_mass || '';
  const direccion = ultimoEspacio?.address || '';

  app.innerHTML = `
    ${renderBanner(ultimoLogoUrl)}
    <h1 class="inicio-parroquia">${escapeHtml(nombreParroquia())}</h1>
    ${lugar ? `<p class="parroquia">${escapeHtml(lugar)}</p>` : ''}
    <div class="vas-a-misa-card">
      <h2 class="vas-a-misa-titulo">¿Vas a misa hoy? ${renderBadge()}</h2>
      ${
        proximaMisa || direccion
          ? `
        <p class="proxima-misa-label">Próxima misa</p>
        ${proximaMisa ? `<p class="proxima-misa-hora">${escapeHtml(proximaMisa)}</p>` : ''}
        ${direccion ? `<p class="proxima-misa-direccion">📍 ${escapeHtml(direccion)}</p>` : ''}
      `
          : `<p class="proxima-misa-hora">Todavía no cargaron el horario — probá más tarde.</p>`
      }
    </div>
    <div class="inicio-menu">
      <a class="inicio-menu-item" href="${hrefTo('')}">
        <span class="inicio-menu-icon">🎵</span>
        <span>Mira las canciones que vamos a hacer</span>
        ${renderBadge()}
      </a>
      <a class="inicio-menu-item" href="${hrefTo('lecturas')}">
        <span class="inicio-menu-icon">📖</span>
        <span>Mira las lecturas</span>
        ${renderBadgeLecturas()}
      </a>
    </div>
    ${renderNovedades(separarLecturas(ultimosAnuncios).otrosAvisos)}
    ${renderRedesCompacto()}
  `;
}

// --- Redes sociales: renglón compacto al fondo de Inicio, más una
// pantalla propia (#/redes) pensada para compartirse directo (bio de
// Instagram, WhatsApp) sin pasar primero por la lista de cantos. Una
// parroquia que no cargó ninguna red simplemente no muestra nada acá.
const REDES_CONFIG = [
  { key: 'instagram', icon: '📷', label: 'Instagram' },
  { key: 'facebook', icon: '📘', label: 'Facebook' },
  { key: 'youtube', icon: '▶️', label: 'YouTube' },
  { key: 'whatsapp', icon: '💬', label: 'WhatsApp' },
];

function redesDisponibles() {
  return REDES_CONFIG.filter((red) => ultimoEspacio?.[red.key]);
}

function renderRedesCompacto() {
  const redes = redesDisponibles();
  if (redes.length === 0) return '';
  return `
    <div class="redes-compacto">
      <a class="redes-compacto-titulo" href="${hrefTo('redes')}">📱 Seguinos en redes</a>
      <div class="redes-compacto-links">
        ${redes
          .map(
            (red) =>
              `<a class="redes-compacto-link" href="${escapeHtml(ultimoEspacio[red.key])}" target="_blank" rel="noopener" title="${escapeHtml(red.label)}">${red.icon}</a>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderRedes() {
  const redes = redesDisponibles();
  app.innerHTML = `
    <div class="lecturas-topbar">
      <a class="btn-volver" href="${hrefTo('inicio')}">← Volver</a>
      <h1 class="lecturas-titulo">Seguinos en redes</h1>
    </div>
    ${
      redes.length === 0
        ? `<p class="empty">Todavía no cargaron redes sociales para ${escapeHtml(nombreParroquia())}.</p>`
        : `<div class="inicio-menu">
        ${redes
          .map(
            (red) => `
        <a class="inicio-menu-item" href="${escapeHtml(ultimoEspacio[red.key])}" target="_blank" rel="noopener">
          <span class="inicio-menu-icon">${red.icon}</span>
          <span>${escapeHtml(red.label)}</span>
        </a>`
          )
          .join('')}
      </div>`
    }
  `;
}

// --- Pantalla de Lecturas -------------------------------------------------
// Reusa la misma tabla de Novedades: el equipo carga la 1ª Lectura, el
// Salmo, la 2ª Lectura y el Evangelio como si fueran avisos más (título +
// texto) — acá se reconocen esos 4 títulos puntuales y se muestran siempre
// en el orden de la misa, sin importar el orden en que se hayan cargado;
// cualquier otro aviso (un evento real, por ejemplo) se agrupa aparte, debajo.
const COMBINING_MARKS_LECTURAS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

function normalizarTitulo(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS_LECTURAS, '')
    .trim()
    .toUpperCase();
}

// Varias formas posibles de tipear cada lectura (con "ª", con "RA"/"DA", o
// el nombre completo) apuntan todas a la misma posición en el orden de la
// misa — así no importa cuál haya usado el equipo al cargarla.
const ORDEN_LECTURAS = new Map([
  ['1ª LECTURA', 0],
  ['1RA LECTURA', 0],
  ['PRIMERA LECTURA', 0],
  ['SALMO', 1],
  ['SALMO RESPONSORIAL', 1],
  ['2ª LECTURA', 2],
  ['2DA LECTURA', 2],
  ['SEGUNDA LECTURA', 2],
  ['EVANGELIO', 3],
]);

// Ordenadas de más larga a más corta para que, si el título empieza con
// una y además contiene otra como substring (no debería pasar con estas
// 4, pero por las dudas), gane la coincidencia más específica.
const ORDEN_LECTURAS_CLAVES = [...ORDEN_LECTURAS.keys()].sort((a, b) => b.length - a.length);

// No exige el título exacto: alcanza con que EMPIECE con uno de los
// nombres conocidos (ej. "Evangelio (Mt 20,1-16)" o "Salmo 22" también
// cuentan) — así una referencia bíblica pegada al título no hace que la
// lectura se trate como un aviso común y se filtre a la pantalla
// principal en vez de quedar solo en Lecturas.
function ordenLectura(titulo) {
  const normalizado = normalizarTitulo(titulo);
  const clave = ORDEN_LECTURAS_CLAVES.find((k) => normalizado.startsWith(k));
  return clave === undefined ? null : ORDEN_LECTURAS.get(clave);
}

// Separa lo cargado en Novedades en dos grupos: las 4 lecturas litúrgicas
// (en su orden fijo) y todo lo demás (avisos/eventos reales) — lo usan
// tanto la pantalla de Lecturas como la de Inicio, para no repetir la
// misma lógica dos veces.
function separarLecturas(anuncios) {
  const lecturas = [];
  const otrosAvisos = [];
  for (const anuncio of anuncios) {
    const orden = ordenLectura(anuncio.titulo);
    if (orden === null) otrosAvisos.push(anuncio);
    else lecturas.push({ ...anuncio, orden });
  }
  lecturas.sort((a, b) => a.orden - b.orden);
  return { lecturas, otrosAvisos };
}

function renderLecturas() {
  const { lecturas, otrosAvisos } = separarLecturas(ultimosAnuncios);
  const fecha = lecturas[0]?.fecha || null;
  const estado = estadoParaFecha(fecha);

  app.innerHTML = `
    <div class="lecturas-topbar">
      <a class="btn-volver" href="${hrefTo('inicio')}">← Volver</a>
      <h1 class="lecturas-titulo">${fecha ? 'Lecturas' : 'Lecturas de hoy'}</h1>
    </div>
    ${
      fecha
        ? `<p class="fecha">${escapeHtml(formatFechaLarga(fecha))} ${estado ? `<span class="estado-badge ${estado.clase}">${estado.label}</span>` : ''}</p>`
        : ''
    }
    ${
      lecturas.length === 0
        ? `<p class="empty">Todavía no se cargaron las lecturas de hoy.</p>`
        : lecturas
            .map(
              (lectura) => `
        <section class="cancion">
          <h2 class="categoria">${escapeHtml(lectura.titulo)}</h2>
          <p class="letra">${escapeHtml(lectura.cuerpo)}</p>
        </section>`
            )
            .join('')
    }
    ${renderNovedades(otrosAvisos)}
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

window.addEventListener('hashchange', renderTodo);

cargarYMostrar();
setInterval(cargarYMostrar, REFRESH_MS);
