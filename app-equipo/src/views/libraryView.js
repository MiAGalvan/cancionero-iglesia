// Vista principal: primero muestra las categorías (las 12 litúrgicas fijas,
// en su orden, más las carpetas que el equipo haya agregado), y al entrar a
// una se ve la lista de canciones de esa categoría. Como una canción puede
// tener varias categorías, puede aparecer repetida en más de una carpeta —
// es lo esperado (ej. un canto de Comunión que también se usa de
// Meditación). El buscador de la pantalla de carpetas busca en toda la
// biblioteca, sin importar la categoría.
import { searchSongs, deleteSong, getAllSongs, getSongsByCategory } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { getSession, signOut } from '../storage/auth.js';
import {
  getAllCategories,
  isCustomCategory,
  addCustomCategory,
  deleteCustomCategory,
  getHeaderTitle,
  setHeaderTitle,
} from '../storage/settings.js';

export async function renderLibraryView(container, { category } = {}) {
  if (category) {
    renderCategoryView(container, category);
  } else {
    renderFoldersView(container);
  }
}

async function renderFoldersView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div class="header-title-row">
        <h1 id="header-title">${escapeHtml(getHeaderTitle())}</h1>
        <button class="btn btn-icon" id="edit-title-btn" title="Cambiar título">✏️</button>
      </div>
      <div class="form-actions">
        <span id="auth-status"></span>
        <button class="btn btn-icon" id="sync-btn" title="Sincronizar cancionero con el resto del equipo">🔄</button>
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

  container.querySelector('#edit-title-btn').addEventListener('click', () => {
    const nuevoTitulo = prompt('Título de la biblioteca', getHeaderTitle());
    if (nuevoTitulo === null) return; // canceló
    setHeaderTitle(nuevoTitulo);
    container.querySelector('#header-title').textContent = getHeaderTitle();
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
    const result = await syncNow();
    if (!silent) syncBtn.disabled = false;

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
    }
  });

  async function renderResultsOrFolders() {
    const query = searchInput.value.trim();
    try {
      if (!query) {
        const songs = await getAllSongs();
        const counts = {};
        for (const song of songs) {
          for (const cat of song.categories) counts[cat] = (counts[cat] || 0) + 1;
        }
        contentEl.innerHTML = `
          <ul class="folder-list">
            ${getAllCategories()
              .map(
                (cat) => `
              <li>
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

      const songs = await searchSongs(query);
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
    const songs = await getSongsByCategory(category);
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? songs.filter(
          (song) =>
            song.title.toLowerCase().includes(needle) || song.artist.toLowerCase().includes(needle)
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
