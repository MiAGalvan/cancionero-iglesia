// Vista principal: primero muestra las categorías (las 12 litúrgicas fijas,
// en su orden, más las carpetas que el equipo haya agregado), y al entrar a
// una se ve la lista de canciones de esa categoría. Como una canción puede
// tener varias categorías, puede aparecer repetida en más de una carpeta —
// es lo esperado (ej. un canto de Comunión que también se usa de
// Meditación). El buscador de la pantalla de carpetas busca en toda la
// biblioteca, sin importar la categoría.
import { searchSongs, deleteSong, getAllSongs, getSongsByCategory } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { syncSpacesNow } from '../storage/spacesSync.js';
import { getSession, signOut, getVisibleSpaces } from '../storage/auth.js';
import { getSpaceLogoUrl } from '../storage/logos.js';
import {
  getAllCategories,
  isCustomCategory,
  addCustomCategory,
  deleteCustomCategory,
  moveCategory,
  getHeaderTitle,
  setHeaderTitle,
  getCurrentSpaceKey,
  setCurrentSpaceKey,
  getSpaces,
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

export async function renderLibraryView(container, { category } = {}) {
  if (category) {
    renderCategoryView(container, category);
  } else {
    renderFoldersView(container);
  }
}

async function renderFoldersView(container) {
  const visibleSpaces = await getVisibleSpaces();
  // Si el espacio actual ya no está entre los permitidos (ej. cambiaron
  // los permisos de este usuario, o es la primera vez que entra
  // restringido), lo corregimos solo a la primera parroquia que sí puede
  // tocar, en vez de dejarlo trabajando en una que ya no le corresponde.
  if (!visibleSpaces.some((space) => space.key === getCurrentSpaceKey())) {
    setCurrentSpaceKey(visibleSpaces[0].key);
  }

  container.innerHTML = `
    <div class="topbar">
      <div class="header-title-row">
        <img id="space-logo" class="space-logo-icon" alt="" hidden />
        <h1 id="header-title">${escapeHtml(getHeaderTitle())}</h1>
        <button class="btn btn-icon" id="edit-title-btn" title="Cambiar título">✏️</button>
        <button class="btn btn-icon" id="theme-toggle-btn" title="Cambiar entre pantalla clara y oscura">${
          getEffectiveTheme() === 'dark' ? '☀️' : '🌙'
        }</button>
      </div>
      <div class="form-actions">
        <select id="space-switcher" title="Parroquia o capilla con la que estás trabajando ahora">
          ${renderSpaceOptions(visibleSpaces)}
        </select>
        <a class="btn btn-icon" href="#/espacios" title="Agregar o editar parroquias y capillas">⚙️</a>
        <button class="btn btn-icon" id="device-group-btn" title="Qué grupo/coro usa este dispositivo (para saber quién publicó o editó cada cosa)">
          🎤 ${escapeHtml(getDeviceGroup() || 'Grupo')}
        </button>
        <span id="auth-status"></span>
        <button class="btn btn-icon" id="sync-btn" title="Sincronizar cancionero con el resto del equipo">🔄</button>
        <a class="btn" href="#/lista-publicada" title="Ver la lista publicada, sin login">👀 Ver publicada</a>
        <a class="btn" href="#/proyeccion" title="Pantalla grande para HDMI/proyector">🖥 Proyección</a>
        <a class="btn" href="#/novedades" title="Avisos, eventos y lecturas para la página pública">📣 Novedades</a>
        <a class="btn" href="#/compartidas" title="Canciones que otras parroquias compartieron">📚 Compartidas</a>
        <a class="btn" href="#/misa/nueva" title="Armar lista de misa">📋 Lista de misa</a>
        <button class="btn" id="new-folder-btn">+ Nueva carpeta</button>
        <a class="btn btn-accent" href="#/song/new">+ Nueva canción</a>
      </div>
    </div>
    <div class="warning-box sync-status" id="sync-status" hidden></div>
    <div class="library-search">
      <input type="text" id="search-input" placeholder="Buscar en todas las categorías..." />
    </div>
    <div id="library-content"></div>
  `;

  // Se pide aparte (no bloquea el resto de la pantalla): si no hay logo
  // cargado para esta parroquia, o no hay conexión, el título se queda
  // igual que siempre, sin el ícono.
  getSpaceLogoUrl(getCurrentSpaceKey()).then((logoUrl) => {
    if (!logoUrl) return;
    const logoEl = container.querySelector('#space-logo');
    if (!logoEl) return;
    logoEl.src = logoUrl;
    logoEl.hidden = false;
  });

  container.querySelector('#space-switcher').addEventListener('change', (event) => {
    setCurrentSpaceKey(event.target.value);
    renderFoldersView(container);
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
    container.querySelector('#device-group-btn').textContent = `🎤 ${getDeviceGroup() || 'Grupo'}`;
  });

  container.querySelector('#new-folder-btn').addEventListener('click', () => {
    const nombre = prompt('Nombre de la nueva carpeta (categoría)');
    if (nombre === null || !nombre.trim()) return;
    addCustomCategory(nombre);
    renderResultsOrFolders();
  });

  const authStatusEl = container.querySelector('#auth-status');

  // Antes no había ninguna forma visible de llegar a la pantalla de login
  // salvo entrando a "Publicar" — ahora que también hace falta para
  // sincronizar el cancionero, dejamos siempre a la vista si hay sesión
  // iniciada (y con quién) o un acceso directo para entrar.
  async function renderAuthStatus() {
    const session = await getSession();
    if (session) {
      authStatusEl.innerHTML = `<button class="btn" id="logout-btn" title="${escapeAttr(
        session.user.email
      )}">👤 Salir</button>`;
      authStatusEl.querySelector('#logout-btn').addEventListener('click', async () => {
        if (confirm(`¿Cerrar sesión de ${session.user.email}?`)) {
          await signOut();
          renderAuthStatus();
        }
      });
    } else {
      authStatusEl.innerHTML = `<a class="btn" href="#/login?returnTo=${encodeURIComponent('/library')}">Ingresar</a>`;
    }
  }
  renderAuthStatus();

  const syncBtn = container.querySelector('#sync-btn');
  const syncStatusEl = container.querySelector('#sync-status');

  // El cancionero completo (con acordes) se sincroniza con la tabla privada
  // `songs` de Supabase — así una canción agregada desde el celu de otro
  // integrante del equipo aparece acá. Sin sesión o sin conexión, syncNow()
  // no hace nada; por eso al abrir la biblioteca probamos solo (en
  // silencio, sin mensajes) por si ya había sesión y wifi.
  async function runSync({ silent = false } = {}) {
    if (!silent) {
      syncBtn.disabled = true;
      syncStatusEl.hidden = false;
      syncStatusEl.textContent = 'Sincronizando...';
    }
    const [result, spacesResult] = await Promise.all([syncNow(), syncSpacesNow()]);
    if (!silent) syncBtn.disabled = false;

    // Si cambió la lista de parroquias (una nueva, un nombre editado desde
    // otro dispositivo), repintamos toda la pantalla para que el selector
    // de arriba quede al día — no solo la lista de canciones.
    if (spacesResult.changed) {
      renderFoldersView(container);
      return;
    }

    if (result.synced) {
      if (result.pulled > 0) renderResultsOrFolders();
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

  const searchInput = container.querySelector('#search-input');
  const contentEl = container.querySelector('#library-content');

  // Un solo listener delegado: sirve para los botones "eliminar" de
  // canciones, carpetas y resultados de búsqueda, sin importar cuántas
  // veces se vuelva a pintar #library-content.
  contentEl.addEventListener('click', async (event) => {
    const deleteId = event.target.dataset.delete;
    const deleteCategory = event.target.dataset.deleteCategory;
    const moveUp = event.target.dataset.moveUp;
    const moveDown = event.target.dataset.moveDown;
    if (deleteId) {
      if (confirm('¿Eliminar esta canción?')) {
        const deleted = await deleteSong(Number(deleteId));
        renderResultsOrFolders();
        if (deleted) propagateDelete(deleted.uuid).then(() => syncNow());
      }
    } else if (deleteCategory) {
      if (confirm(`¿Eliminar la carpeta "${deleteCategory}"? Las canciones no se borran, solo dejan de tener esa etiqueta.`)) {
        deleteCustomCategory(deleteCategory);
        renderResultsOrFolders();
      }
    } else if (moveUp) {
      moveCategory(moveUp, 'up');
      renderResultsOrFolders();
    } else if (moveDown) {
      moveCategory(moveDown, 'down');
      renderResultsOrFolders();
    }
  });

  async function renderResultsOrFolders() {
    const query = searchInput.value.trim();
    try {
      if (!query) {
        const songs = await getAllSongs(getCurrentSpaceKey());
        const counts = {};
        for (const song of songs) {
          for (const cat of song.categories) counts[cat] = (counts[cat] || 0) + 1;
        }
        const cats = getAllCategories();
        contentEl.innerHTML = `
          <ul class="folder-list">
            ${cats
              .map(
                (cat, i) => `
              <li>
                <span class="folder-move">
                  <button class="btn btn-icon" data-move-up="${escapeAttr(cat)}" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
                  <button class="btn btn-icon" data-move-down="${escapeAttr(cat)}" title="Bajar" ${i === cats.length - 1 ? 'disabled' : ''}>▼</button>
                </span>
                <a class="folder-item" href="#/library/${encodeURIComponent(cat)}">
                  <span class="folder-icon">📁</span>
                  <span class="folder-name">${escapeHtml(cat)}</span>
                  <span class="folder-count">${counts[cat] || 0}</span>
                </a>
                ${
                  isCustomCategory(cat)
                    ? `<button class="btn btn-danger btn-icon" data-delete-category="${escapeAttr(cat)}" title="Eliminar carpeta">✕</button>`
                    : ''
                }
              </li>`
              )
              .join('')}
          </ul>
        `;
        return;
      }

      const songs = await searchSongs(query, getCurrentSpaceKey());
      contentEl.innerHTML = songSearchResultsHtml(songs);
    } catch (err) {
      console.error('No se pudo cargar el cancionero:', err);
      contentEl.innerHTML = `<div class="empty-state">No se pudo cargar el cancionero: ${escapeHtml(
        err.message || String(err)
      )}. Probá recargar la página.</div>`;
    }
  }

  searchInput.addEventListener('input', renderResultsOrFolders);
  renderResultsOrFolders();
}

async function renderCategoryView(container, category) {
  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Categorías</a>
      <h2>${escapeHtml(category)}</h2>
      <a class="btn btn-accent" href="#/song/new/${encodeURIComponent(category)}">+ Nueva</a>
    </div>
    <div class="library-search">
      <input type="text" id="search-input" placeholder="Buscar en ${escapeHtml(category)}..." />
    </div>
    <ul class="song-list" id="song-list"></ul>
  `;

  const searchInput = container.querySelector('#search-input');
  const listEl = container.querySelector('#song-list');

  listEl.addEventListener('click', async (event) => {
    const deleteId = event.target.dataset.delete;
    if (!deleteId) return;
    if (confirm('¿Eliminar esta canción?')) {
      const deleted = await deleteSong(Number(deleteId));
      refresh(searchInput.value);
      if (deleted) propagateDelete(deleted.uuid).then(() => syncNow());
    }
  });

  async function refresh(query = '') {
    const songs = await getSongsByCategory(category, getCurrentSpaceKey());
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? songs.filter(
          (song) =>
            song.title.toLowerCase().includes(needle) ||
            song.artist.toLowerCase().includes(needle) ||
            (song.tags || []).some((tag) => tag.toLowerCase().includes(needle))
        )
      : songs;

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">No hay canciones acá todavía.</li>`;
      return;
    }
    listEl.innerHTML = filtered.map(songItemHtml).join('');
  }

  searchInput.addEventListener('input', () => refresh(searchInput.value));
  refresh();
}

function songSearchResultsHtml(songs) {
  if (songs.length === 0) {
    return `<div class="empty-state">No se encontraron canciones.</div>`;
  }
  return `<ul class="song-list">${songs.map(songItemHtml).join('')}</ul>`;
}

function songItemHtml(song) {
  return `
    <li class="song-item" data-id="${song.id}">
      <a href="#/song/${song.id}">
        ${escapeHtml(song.title || '(sin título)')}
        <span class="song-artist">
          ${escapeHtml(song.artist || '')}
          ${song.categories.map((cat) => `<span class="category-tag">${escapeHtml(cat)}</span>`).join('')}
          ${(song.tags || []).map((tag) => `<span class="liturgical-tag">🕊️ ${escapeHtml(tag)}</span>`).join('')}
        </span>
      </a>
      <button class="btn btn-danger btn-icon" data-delete="${song.id}" title="Eliminar">✕</button>
    </li>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
