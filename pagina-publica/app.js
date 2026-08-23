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

// --- Instalar como app: la mayoría de la gente no sabe que "Crear acceso
// directo" (la opción genérica del navegador) existe, y ese acceso queda
// con un ícono gris feo, sin nombre de la parroquia. Con un manifest +
// service worker, Chrome ofrece instalarla como una app de verdad (ícono
// propio, sin la barra de direcciones) y podemos disparar ese cartel
// nosotros mismos con un botón, en vez de depender de que alguien
// encuentre la opción escondida en el menú del navegador. En iPhone
// (Safari) no existe ese cartel automático — ahí solo se puede mostrar
// cómo hacerlo a mano (Compartir → Agregar a pantalla de inicio).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// El manifest se arma en memoria (no es un archivo fijo) porque el nombre
// y el link de "abrir" tienen que ser los de ESTA parroquia en particular
// (?space=...) — si el manifest fuera un solo archivo fijo para todas,
// instalar la página de Merced abriría la de San Cayetano la próxima vez.
function instalarManifestDinamico() {
  const manifest = {
    name: `${nombreParroquia()} — Rezar Cantando`,
    short_name: 'Rezar Cantando',
    start_url: window.location.pathname + window.location.search,
    scope: window.location.pathname,
    display: 'standalone',
    background_color: '#0f2220',
    theme_color: '#2f8a7a',
    icons: [
      { src: new URL('icons/icon-192.png', window.location.href).href, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: new URL('icons/icon-512.png', window.location.href).href, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = blobUrl;
}

// Ya instalada (o abierta desde el ícono ya instalado) → nunca mostrar el
// botón de instalar, no tiene sentido ofrecerlo de nuevo.
function yaEstaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let promptDeInstalacion = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  promptDeInstalacion = event;
  actualizarBotonInstalar();
});

window.addEventListener('appinstalled', () => {
  promptDeInstalacion = null;
  actualizarBotonInstalar();
});

function actualizarBotonInstalar() {
  const btn = document.getElementById('install-btn');
  const hintIOS = document.getElementById('install-ios-hint');
  if (!btn && !hintIOS) return; // esta pantalla no tiene el bloque de instalar

  if (yaEstaInstalada()) {
    if (btn) btn.hidden = true;
    if (hintIOS) hintIOS.hidden = true;
    return;
  }
  if (btn) btn.hidden = !promptDeInstalacion;
  if (hintIOS) hintIOS.hidden = !(esIOS && !promptDeInstalacion);
}

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
    supabase.from('anuncios').select('titulo, cuerpo, fecha, updated_at').eq('space', space).order('updated_at', { ascending: false }),
    supabase.from('espacio_logos').select('logo_url').eq('space', space).maybeSingle(),
    // "*" en vez de nombrar cada columna a propósito: si en el futuro se
    // agrega otro campo nuevo a `spaces` y todavía no se corrió la
    // migración en este proyecto, esa columna simplemente no viene en la
    // fila (queda undefined, se trata como vacía) en vez de tirar abajo
    // TODA la consulta — ya pasó una vez que una columna faltante hizo
    // desaparecer datos que ya andaban bien (dirección, próxima misa).
    supabase.from('spaces').select('*').eq('key', space).maybeSingle(),
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
  instalarManifestDinamico();
  renderTodo();
}

// Una vez que alguien entró a "Inicio" desde este celular (tocando "🔔
// Enterate de lo próximo"), se guarda acá — así, la próxima vez que abra
// el mismo link (o vuelva a escanear el QR), lo mandamos directo a Inicio
// en vez de hacerlo pasar de nuevo por toda la lista de canciones para
// llegar ahí. Por parroquia, porque un mismo celular puede seguir más de
// una.
const VISITO_INICIO_KEY = `cancionero-iglesia:visito-inicio:${space}`;

function marcarVisitoInicio() {
  try {
    localStorage.setItem(VISITO_INICIO_KEY, '1');
  } catch {
    // localStorage bloqueado (modo privado, etc.) — no es grave, simplemente
    // no se recuerda para la próxima visita.
  }
}

function yaVisitoInicio() {
  try {
    return localStorage.getItem(VISITO_INICIO_KEY) === '1';
  } catch {
    return false;
  }
}

// A diferencia de cargarYMostrar (que pide datos nuevos), esto solo vuelve
// a pintar la pantalla con lo último que ya se trajo — se usa al tocar un
// botón de idioma o al cambiar de pantalla, para que sea instantáneo y no
// dependa de pedir de nuevo la lista de cantos.
function renderTodo() {
  const route = currentRoute();

  if (route === '' && yaVisitoInicio()) {
    // No usamos location.hash = ... para no agregar una entrada nueva al
    // historial (el botón "atrás" del celular llevaría de vuelta acá,
    // volviendo a rebotar a Inicio) — reemplazamos la URL actual en su
    // lugar.
    history.replaceState(null, '', hrefTo('inicio'));
    renderInicio();
    return;
  }

  if (route === 'inicio') {
    marcarVisitoInicio();
    renderInicio();
  } else if (route === 'lecturas') {
    renderLecturas();
  } else if (route === 'redes') {
    renderRedes();
  } else if (route === 'capillas') {
    renderCapillas();
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

  document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!promptDeInstalacion) return;
    promptDeInstalacion.prompt();
    await promptDeInstalacion.userChoice;
    promptDeInstalacion = null;
    actualizarBotonInstalar();
  });
  actualizarBotonInstalar();
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

// La fecha "representativa" de las 4 lecturas es la de la que se haya
// tocado más recientemente (updated_at), no la primera en el orden de la
// misa (1ª Lectura). Si el equipo actualiza solo el Evangelio para hoy y
// deja las otras 3 con la fecha de la semana pasada (sin querer, o porque
// todavía no las cargó), mirar siempre la 1ª Lectura mostraba la fecha
// vieja y el aviso de "en vivo hoy" no aparecía aunque el Evangelio sí
// estuviera al día.
function fechaRepresentativaLecturas(lecturas) {
  if (lecturas.length === 0) return null;
  const masReciente = lecturas.reduce((mejor, l) =>
    !mejor || (l.updated_at || '') > (mejor.updated_at || '') ? l : mejor
  );
  return masReciente.fecha || null;
}

function fechaLecturas() {
  return fechaRepresentativaLecturas(separarLecturas(ultimosAnuncios).lecturas);
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

// Mismos números que Date.getDay() (0 = domingo). El equipo carga un
// horario semanal que se repite (ver novedadesView.js); acá se calcula
// cuál es la próxima ocurrencia a partir de la hora actual, para no
// depender de que alguien lo actualice a mano cada semana. Si todavía no
// hay ningún horario cargado, se usa el texto libre de siempre
// (`next_mass`) como respaldo.
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Devuelve { texto, estado } a partir del horario semanal, o null si
// todavía no se cargó ninguno (ahí se usa el texto libre de respaldo,
// donde no hay forma de saber nada de esto). `estado` es uno de:
//   'en-vivo'  → hay una misa hoy en curso: ya empezó y, si se cargó
//                "hasta" para esa fila, todavía no terminó. Sin "hasta"
//                cargado, se considera en curso el resto del día (mismo
//                criterio que ya usan las lecturas: por fecha, no por una
//                ventana de horas exacta, porque no sabemos cuánto dura).
//   'hoy'      → hay misa hoy pero más tarde, todavía no llegó la hora
//                (o la de recién ya terminó y no hay otra más tarde hoy
//                — nota: en ese caso cae a 'futuro', ver abajo).
//   'futuro'   → la próxima ocurrencia es otro día (o más tarde hoy no
//                queda ninguna, la que había ya terminó).
function proximaMisaDesdeHorario(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) return null;
  const ahora = new Date();
  const hoyDia = ahora.getDay();
  const hoyMin = ahora.getHours() * 60 + ahora.getMinutes();

  const aMinutos = (hora) => {
    const [hh, mm] = hora.split(':').map(Number);
    return hh * 60 + (mm || 0);
  };

  const deHoy = horarios.filter((h) => typeof h?.dia === 'number' && h.dia === hoyDia && h?.hora);

  // ¿Alguna de hoy está en curso ahora mismo?
  const enCurso = deHoy.find((h) => {
    const inicio = aMinutos(h.hora);
    if (inicio > hoyMin) return false;
    if (!h.horaFin) return true; // sin hora de fin cargada: en curso el resto del día
    return hoyMin < aMinutos(h.horaFin);
  });
  if (enCurso) {
    return { texto: `Hoy, ${enCurso.hora} hs`, estado: 'en-vivo' };
  }

  // Ninguna en curso: la próxima de hoy que todavía no empezó (si la que
  // ya pasó terminó y no queda otra hoy, se sigue de largo a buscar en
  // los próximos días).
  const pendientesHoy = deHoy.filter((h) => aMinutos(h.hora) > hoyMin);
  if (pendientesHoy.length > 0) {
    const proxima = pendientesHoy.reduce((a, b) => (aMinutos(b.hora) < aMinutos(a.hora) ? b : a));
    return { texto: `Hoy, ${proxima.hora} hs`, estado: 'hoy' };
  }

  // Ninguna hoy pendiente: buscar la próxima ocurrencia en los próximos días.
  let mejor = null;
  for (const h of horarios) {
    if (typeof h?.dia !== 'number' || !h?.hora) continue;
    let offsetDias = (h.dia - hoyDia + 7) % 7;
    if (offsetDias === 0) offsetDias = 7; // hoy ya se descartó arriba (o ya terminó)
    const clave = offsetDias * 1440 + aMinutos(h.hora);
    if (!mejor || clave < mejor.clave) mejor = { dia: h.dia, hora: h.hora, offsetDias, clave };
  }
  if (!mejor) return null;

  // La fecha exacta (no solo el nombre del día) evita la ambigüedad de "el
  // domingo" — sin eso, no queda claro si es este domingo o el que viene.
  const fechaMisa = new Date(ahora);
  fechaMisa.setDate(fechaMisa.getDate() + mejor.offsetDias);
  const diaMes = fechaMisa.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  const etiquetaDia = mejor.offsetDias === 1 ? 'Mañana' : `${DIAS_SEMANA[mejor.dia]} ${diaMes}`;
  return { texto: `${etiquetaDia}, ${mejor.hora} hs`, estado: 'futuro' };
}

// --- Pantalla de Inicio: "¿Vas a misa hoy?" ------------------------------
function renderInicio() {
  const lugar = [ultimoEspacio?.locality, ultimoEspacio?.province].filter(Boolean).join(', ');
  const infoMisa = proximaMisaDesdeHorario(ultimoEspacio?.horario_misas);
  const proximaMisa = infoMisa?.texto || ultimoEspacio?.next_mass || '';
  const direccion = ultimoEspacio?.address || '';
  const hayCapillas = (ultimoEspacio?.capillas || []).length > 0;

  // Sin horario semanal cargado (solo texto libre de respaldo) no hay
  // forma de saber nada de esto, así que se deja el título de siempre en
  // vez de arriesgar a decir "hoy" o "en vivo" cuando no corresponde.
  const tituloMisa = infoMisa?.estado === 'futuro' ? 'Próxima misa' : '¿Vas a misa hoy?';
  const BADGES_MISA = {
    'en-vivo': { clase: 'badge-en-vivo', label: '🔴 En vivo hoy' },
    hoy: { clase: 'badge-proximamente', label: '🕓 Hoy' },
    futuro: { clase: 'badge-proximamente', label: '🕓 Próximamente' },
  };
  const badgeInfoMisa = infoMisa ? BADGES_MISA[infoMisa.estado] : null;
  const badgeMisa = badgeInfoMisa ? `<span class="estado-badge ${badgeInfoMisa.clase}">${badgeInfoMisa.label}</span>` : '';

  app.innerHTML = `
    ${renderBanner(ultimoLogoUrl)}
    <h1 class="inicio-parroquia">${escapeHtml(nombreParroquia())}</h1>
    ${lugar ? `<p class="parroquia">${escapeHtml(lugar)}</p>` : ''}
    <div class="vas-a-misa-card">
      <h2 class="vas-a-misa-titulo">${tituloMisa} ${badgeMisa}</h2>
      ${
        proximaMisa || direccion
          ? `
        <p class="proxima-misa-label">${infoMisa?.estado === 'en-vivo' ? 'Misa de hoy' : 'Próxima misa'}</p>
        ${proximaMisa ? `<p class="proxima-misa-hora">${escapeHtml(proximaMisa)}</p>` : ''}
        ${direccion ? `<p class="proxima-misa-direccion">📍 ${escapeHtml(direccion)}</p>` : ''}
      `
          : `<p class="proxima-misa-hora">Todavía no cargaron el horario — probá más tarde.</p>`
      }
    </div>
    <div class="inicio-menu">
      <a class="inicio-menu-item" href="${hrefTo('canciones')}">
        <span class="inicio-menu-icon">🎵</span>
        <span>Mira las canciones que vamos a hacer</span>
        ${renderBadge()}
      </a>
      <a class="inicio-menu-item" href="${hrefTo('lecturas')}">
        <span class="inicio-menu-icon">📖</span>
        <span>Mira las lecturas</span>
        ${renderBadgeLecturas()}
      </a>
      ${
        hayCapillas
          ? `<a class="inicio-menu-item" href="${hrefTo('capillas')}">
        <span class="inicio-menu-icon">⛪</span>
        <span>Mira otras capillas y horarios</span>
      </a>`
          : ''
      }
    </div>
    <button type="button" id="install-btn" class="entrate-btn install-btn" hidden>📲 Instalar esta app en el celular</button>
    <p id="install-ios-hint" class="install-ios-hint" hidden>
      📲 Para instalarla: tocá <strong>Compartir</strong> (el ícono con la flecha, abajo del todo en Safari) y elegí <strong>"Agregar a inicio"</strong>.
    </p>
    ${renderNovedades(separarLecturas(ultimosAnuncios).otrosAvisos)}
    ${renderRedesCompacto()}
  `;
}

// --- Pantalla de otras capillas (informativa, sin cancionero propio) -----
function renderCapillas() {
  const capillas = ultimoEspacio?.capillas || [];
  app.innerHTML = `
    <div class="lecturas-topbar">
      <a class="btn-volver" href="${hrefTo('inicio')}">← Volver</a>
      <h1 class="lecturas-titulo">Otras capillas y horarios</h1>
    </div>
    ${
      capillas.length === 0
        ? `<p class="empty">Todavía no cargaron otras capillas para ${escapeHtml(nombreParroquia())}.</p>`
        : capillas
            .map(
              (c) => `
        <section class="cancion">
          <h2 class="categoria">${escapeHtml(c.nombre)}</h2>
          ${c.horario ? `<p class="proxima-misa-hora">${escapeHtml(c.horario)}</p>` : ''}
          ${c.direccion ? `<p class="proxima-misa-direccion">📍 ${escapeHtml(c.direccion)}</p>` : ''}
        </section>`
            )
            .join('')
    }
  `;
}

// --- Redes sociales: renglón compacto al fondo de Inicio, más una
// pantalla propia (#/redes) pensada para compartirse directo (bio de
// Instagram, WhatsApp) sin pasar primero por la lista de cantos. Una
// parroquia que no cargó ninguna red simplemente no muestra nada acá.
//
// Los íconos son SVG propios (no emoji): en varios celus Android el emoji
// de cámara/libro se ve gris y sin color, poco reconocible — un ícono
// dibujado a mano con el color de cada marca se ve igual en cualquier
// dispositivo.
const REDES_CONFIG = [
  {
    key: 'instagram',
    label: 'Instagram',
    clase: 'redes-bg-instagram',
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="#fff" stroke="none"/></svg>',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    clase: 'redes-bg-facebook',
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M15.1 8.6h-1.9V7.4c0-.5.3-.7.6-.7h1.2V4.1l-1.7 0c-1.9 0-2.8 1.4-2.8 2.9v1.6H9v2.5h1.5V20h2.7v-8.9h1.6l.3-2.5z"/></svg>',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    clase: 'redes-bg-youtube',
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M9.5 8.3v7.4l6.4-3.7-6.4-3.7z"/></svg>',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    clase: 'redes-bg-whatsapp',
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M17 14.2c-.3-.1-1.6-.8-1.9-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1.1-.1.2-.3.2-.6.1-.8-.4-1.6-.8-2.3-1.5-.6-.6-1-1.2-1.4-1.9-.1-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9 1-.9 2.3s1 2.6 1.1 2.8c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm0 18.2a8.1 8.1 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1 1 12 20.2z"/></svg>',
  },
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
              `<a class="redes-compacto-link ${red.clase}" href="${escapeHtml(ultimoEspacio[red.key])}" target="_blank" rel="noopener" title="${escapeHtml(red.label)}">${red.svg}</a>`
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
          <span class="redes-icon-menu ${red.clase}">${red.svg}</span>
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
  const fecha = fechaRepresentativaLecturas(lecturas);
  const estado = estadoParaFecha(fecha);
  const evangelio = lecturas.find((l) => normalizarTitulo(l.titulo).startsWith('EVANGELIO'));

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
    <p class="lecturas-inspiracion">"Cantar y tocar es rezar" — San Agustín</p>
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
    ${
      evangelio
        ? `<div class="entrate-promo">
            <button type="button" id="compartir-evangelio-btn" class="entrate-btn">📤 Compartir el Evangelio de hoy</button>
          </div>
          <p id="compartir-evangelio-status" class="letra-aviso compartir-evangelio-status" hidden></p>`
        : ''
    }
    ${renderNovedades(otrosAvisos)}
  `;

  // Invita a leer antes de venir a misa, no solo avisa que la lectura está
  // cargada — mismo texto y mecanismo (Web Share API con fallback a
  // portapapeles) que el botón del equipo en app-equipo/novedadesView.js,
  // pero acá lo puede tocar cualquiera que entró por el QR, no solo el
  // equipo de música.
  document.getElementById('compartir-evangelio-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('compartir-evangelio-status');
    const referencia = (evangelio.cuerpo || '').split('\n')[0].trim();
    const url = `${window.location.origin}${window.location.pathname}${hrefTo('lecturas')}`;
    const texto = `🎶 Antes de cantar, recemos.\n\nLeé el Evangelio de hoy${
      referencia ? ` (${referencia})` : ''
    } para llegar a la misa con el corazón afinado — cantar también es orar.\n\n${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Evangelio de hoy', text: texto });
      } catch {
        // Canceló el menú de compartir, o falló: no hace falta avisar nada.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      statusEl.hidden = false;
      statusEl.textContent = '✓ Texto copiado, pegalo donde quieras compartirlo.';
    } catch {
      statusEl.hidden = false;
      statusEl.textContent = 'No se pudo copiar. Copialo a mano de arriba.';
    }
  });
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
