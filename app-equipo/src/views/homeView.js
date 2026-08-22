// Pantalla de inicio: parroquia arriba, título del cancionero, el banner
// del logo si hay uno cargado, y todos los accesos (incluido "Cancionero",
// que lleva a las carpetas) como una grilla de cuadrados centrada — tipo
// pantalla de inicio de una app, en vez de una fila larga de botones. Las
// carpetas y canciones en sí viven en libraryView.js, no acá.
import { syncNow } from '../storage/sync.js';
import { syncSpacesNow } from '../storage/spacesSync.js';
import { syncLabelsNow, pushCustomCategory } from '../storage/labelsSync.js';
import { getSession, signOut, getVisibleSpaces } from '../storage/auth.js';
import { getSpaceLogoUrl } from '../storage/logos.js';
import { puedeInstalar, mostrarInstruccionesIOS, instalar, onCambioDisponibilidad } from '../pwaInstall.js';
import {
  addCustomCategory,
  getHeaderTitle,
  setHeaderTitle,
  getCurrentSpaceKey,
  setCurrentSpaceKey,
  getEffectiveTheme,
  setStoredTheme,
  getDeviceGroup,
  setDeviceGroup,
} from '../storage/settings.js';

// Agrupa las opciones del selector por provincia (con <optgroup>), así con
// varias parroquias en distintos lugares queda claro cuál es cuál de un
// vistazo, sin tener que abrir "Parroquias y capillas" para acordarse.
// `spaces` ya viene filtrada (ver getVisibleSpaces): un integrante
// restringido a una sola parroquia ni siquiera ve acá las demás.
function renderSpaceOptions(spaces) {
  const currentKey = getCurrentSpaceKey();
  const byProvince = new Map();
  for (const space of spaces) {
    const province = space.province || 'Sin provincia';
    if (!byProvince.has(province)) byProvince.set(province, []);
    byProvince.get(province).push(space);
  }

  return Array.from(byProvince.entries())
    .map(
      ([province, spaces]) => `
      <optgroup label="${escapeAttr(province)}">
        ${spaces
          .map(
            (space) => `
          <option value="${escapeAttr(space.key)}" ${space.key === currentKey ? 'selected' : ''}>
            ${escapeHtml(space.locality ? `${space.label} (${space.locality})` : space.label)}
          </option>`
          )
          .join('')}
      </optgroup>`
    )
    .join('');
}

export async function renderHomeView(container) {
  const visibleSpaces = await getVisibleSpaces();
  // Si el espacio actual ya no está entre los permitidos (ej. cambiaron
  // los permisos de este usuario, o es la primera vez que entra
  // restringido), lo corregimos solo a la primera parroquia que sí puede
  // tocar, en vez de dejarlo trabajando en una que ya no le corresponde.
  if (!visibleSpaces.some((space) => space.key === getCurrentSpaceKey())) {
    setCurrentSpaceKey(visibleSpaces[0].key);
  }

  container.innerHTML = `
    <div class="topbar library-topbar">
      <div class="header-title-row">
        <select id="space-switcher" title="Parroquia o capilla con la que estás trabajando ahora">
          ${renderSpaceOptions(visibleSpaces)}
        </select>
      </div>
      <div class="header-title-row library-title-row">
        <h1 id="header-title">${escapeHtml(getHeaderTitle())}</h1>
        <button class="btn btn-icon" id="edit-title-btn" title="Cambiar título">✏️</button>
        <button class="btn btn-icon" id="theme-toggle-btn" title="Cambiar entre pantalla clara y oscura">${
          getEffectiveTheme() === 'dark' ? '☀️' : '🌙'
        }</button>
      </div>
    </div>
    <div class="home-banner" id="space-banner" hidden>
      <img id="space-logo" alt="" />
    </div>
    <button type="button" class="btn btn-accent install-app-btn" id="install-app-btn" hidden>
      📲 Instalar esta app en el celular
    </button>
    <p class="install-ios-hint" id="install-ios-hint" hidden>
      📲 Para instalarla: tocá <strong>Compartir</strong> (el ícono con la flecha, abajo en Safari) y elegí <strong>"Agregar a inicio"</strong>.
    </p>
    <div class="quick-actions-grid">
      <a class="quick-tile quick-tile-accent hide-on-mobile-nav" href="#/library" title="Ver las carpetas y canciones">
        <span class="quick-tile-icon">🎵</span>
        <span class="quick-tile-label">Cancionero</span>
      </a>
      <button class="quick-tile" id="device-group-btn" title="Qué grupo/coro usa este dispositivo (para saber quién publicó o editó cada cosa)">
        <span class="quick-tile-icon">🎤</span>
        <span class="quick-tile-label">${escapeHtml(getDeviceGroup() || 'Grupo')}</span>
      </button>
      <span id="auth-status"></span>
      <button class="quick-tile" id="sync-btn" title="Sincronizar cancionero con el resto del equipo">
        <span class="quick-tile-icon">🔄</span>
        <span class="quick-tile-label">Sincronizar</span>
      </button>
      <a class="quick-tile hide-on-mobile-nav" href="#/lista-publicada" title="Ver la lista publicada, sin login">
        <span class="quick-tile-icon">👀</span>
        <span class="quick-tile-label">Ver publicada</span>
      </a>
      <a class="quick-tile" href="#/proyeccion" title="Pantalla grande para HDMI/proyector">
        <span class="quick-tile-icon">🖥</span>
        <span class="quick-tile-label">Proyección</span>
      </a>
      <a class="quick-tile" href="#/novedades" title="Avisos, eventos y lecturas para la página pública">
        <span class="quick-tile-icon">📣</span>
        <span class="quick-tile-label">Novedades</span>
      </a>
      <a class="quick-tile hide-on-mobile-nav" href="#/compartidas" title="Canciones que otras parroquias compartieron">
        <span class="quick-tile-icon">📚</span>
        <span class="quick-tile-label">Compartidas</span>
      </a>
      <a class="quick-tile" href="#/afinador" title="Afinador de guitarra con el micrófono">
        <span class="quick-tile-icon">🎸</span>
        <span class="quick-tile-label">Afinador</span>
      </a>
      <a class="quick-tile hide-on-mobile-nav" href="#/misa/nueva" title="Armar lista de misa">
        <span class="quick-tile-icon">📋</span>
        <span class="quick-tile-label">Lista de misa</span>
      </a>
      <a class="quick-tile" href="#/espacios" title="Agregar o editar parroquias y capillas">
        <span class="quick-tile-icon">⚙️</span>
        <span class="quick-tile-label">Parroquias</span>
      </a>
      <button class="quick-tile" id="new-folder-btn">
        <span class="quick-tile-icon">📁</span>
        <span class="quick-tile-label">Nueva carpeta</span>
      </button>
      <a class="quick-tile quick-tile-accent hide-on-mobile-nav" href="#/song/new">
        <span class="quick-tile-icon">➕</span>
        <span class="quick-tile-label">Nueva canción</span>
      </a>
    </div>
    <div class="warning-box sync-status" id="sync-status" hidden></div>
  `;

  // Se pide aparte (no bloquea el resto de la pantalla): si no hay logo
  // cargado para esta parroquia, o no hay conexión, el banner se queda
  // oculto, sin afectar el resto de la pantalla.
  getSpaceLogoUrl(getCurrentSpaceKey()).then((logoUrl) => {
    if (!logoUrl) return;
    const bannerEl = container.querySelector('#space-banner');
    const logoEl = container.querySelector('#space-logo');
    if (!bannerEl || !logoEl) return;
    logoEl.src = logoUrl;
    bannerEl.hidden = false;
  });

  const installBtn = container.querySelector('#install-app-btn');
  const installHintEl = container.querySelector('#install-ios-hint');
  function actualizarInstalarUI() {
    installBtn.hidden = !puedeInstalar();
    installHintEl.hidden = !mostrarInstruccionesIOS();
  }
  installBtn.addEventListener('click', async () => {
    await instalar();
    actualizarInstalarUI();
  });
  onCambioDisponibilidad(actualizarInstalarUI);
  actualizarInstalarUI();

  container.querySelector('#space-switcher').addEventListener('change', (event) => {
    setCurrentSpaceKey(event.target.value);
    renderHomeView(container);
  });

  container.querySelector('#theme-toggle-btn').addEventListener('click', () => {
    const nuevoTema = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    setStoredTheme(nuevoTema);
    document.documentElement.dataset.theme = nuevoTema;
    container.querySelector('#theme-toggle-btn').textContent = nuevoTema === 'dark' ? '☀️' : '🌙';
  });

  container.querySelector('#edit-title-btn').addEventListener('click', () => {
    const nuevoTitulo = prompt('Título de la biblioteca', getHeaderTitle());
    if (nuevoTitulo === null) return; // canceló
    setHeaderTitle(nuevoTitulo);
    container.querySelector('#header-title').textContent = getHeaderTitle();
  });

  container.querySelector('#device-group-btn').addEventListener('click', () => {
    const nuevoGrupo = prompt(
      'Con qué grupo/coro se usa este dispositivo (ej. "Coro sábado"). Queda guardado en este dispositivo, no se comparte con los demás.',
      getDeviceGroup()
    );
    if (nuevoGrupo === null) return; // canceló
    setDeviceGroup(nuevoGrupo);
    container.querySelector('#device-group-btn .quick-tile-label').textContent = getDeviceGroup() || 'Grupo';
  });

  container.querySelector('#new-folder-btn').addEventListener('click', () => {
    const nombre = prompt('Nombre de la nueva carpeta (categoría) — queda solo para esta parroquia');
    if (nombre === null || !nombre.trim()) return;
    const spaceKey = getCurrentSpaceKey();
    addCustomCategory(spaceKey, nombre);
    pushCustomCategory(spaceKey, nombre.trim()); // en segundo plano, no bloquea la pantalla
    window.location.hash = '#/library';
  });

  const authStatusEl = container.querySelector('#auth-status');

  // Antes no había ninguna forma visible de llegar a la pantalla de login
  // salvo entrando a "Publicar" — ahora que también hace falta para
  // sincronizar el cancionero, dejamos siempre a la vista si hay sesión
  // iniciada (y con quién) o un acceso directo para entrar.
  async function renderAuthStatus() {
    const session = await getSession();
    if (session) {
      authStatusEl.innerHTML = `
        <button class="quick-tile" id="logout-btn" title="${escapeAttr(session.user.email)}">
          <span class="quick-tile-icon">👤</span>
          <span class="quick-tile-label">Salir</span>
        </button>`;
      authStatusEl.querySelector('#logout-btn').addEventListener('click', async () => {
        if (confirm(`¿Cerrar sesión de ${session.user.email}?`)) {
          await signOut();
          renderAuthStatus();
        }
      });
    } else {
      authStatusEl.innerHTML = `
        <a class="quick-tile quick-tile-accent" href="#/login?returnTo=${encodeURIComponent('/inicio')}">
          <span class="quick-tile-icon">👤</span>
          <span class="quick-tile-label">Ingresar</span>
        </a>`;
    }
  }
  renderAuthStatus();

  const syncBtn = container.querySelector('#sync-btn');
  const syncStatusEl = container.querySelector('#sync-status');

  // El cancionero completo (con acordes) se sincroniza con la tabla privada
  // `songs` de Supabase — así una canción agregada desde el celu de otro
  // integrante del equipo aparece acá. Sin sesión o sin conexión, syncNow()
  // no hace nada; por eso al abrir esta pantalla probamos solo (en
  // silencio, sin mensajes) por si ya había sesión y wifi.
  async function runSync({ silent = false } = {}) {
    if (!silent) {
      syncBtn.disabled = true;
      syncStatusEl.hidden = false;
      syncStatusEl.textContent = 'Sincronizando...';
    }
    const [result, spacesResult, labelsResult] = await Promise.all([syncNow(), syncSpacesNow(), syncLabelsNow()]);
    if (!silent) syncBtn.disabled = false;

    // Si cambió la lista de parroquias (una nueva, un nombre editado desde
    // otro dispositivo), repintamos toda la pantalla para que el selector
    // quede al día.
    if (spacesResult.changed || labelsResult.changed) {
      renderHomeView(container);
      return;
    }

    if (result.synced) {
      if (!silent) {
        syncStatusEl.hidden = false;
        syncStatusEl.textContent = `✓ Sincronizado (${result.pulled} bajadas, ${result.pushed} subidas).`;
      }
    } else if (!silent) {
      syncStatusEl.hidden = false;
      syncStatusEl.textContent =
        result.reason === 'not-logged-in'
          ? 'Iniciá sesión para sincronizar el cancionero con el resto del equipo.'
          : result.reason === 'not-configured'
          ? 'Falta configurar Supabase.'
          : result.reason === 'not-authorized'
          ? 'Tu usuario no tiene permiso para sincronizar esta parroquia.'
          : 'No se pudo sincronizar (revisá la conexión).';
    }
  }

  syncBtn.addEventListener('click', () => runSync());
  runSync({ silent: true });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
