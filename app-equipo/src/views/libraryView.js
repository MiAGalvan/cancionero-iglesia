// Vista de las carpetas: las 12 litúrgicas fijas, en su orden, más las
// carpetas que el equipo haya agregado; al entrar a una se ve la lista de
// canciones de esa categoría. Como una canción puede tener varias
// categorías, puede aparecer repetida en más de una carpeta — es lo
// esperado (ej. un canto de Comunión que también se usa de Meditación). El
// buscador de esta pantalla busca en toda la biblioteca, sin importar la
// categoría. La pantalla de inicio (parroquia, título, accesos varios) vive
// en homeView.js — acá solo carpetas y canciones.
import { searchSongs, deleteSong, getAllSongs, getSongsByCategory } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { pushCustomCategoryDeletion } from '../storage/labelsSync.js';
import { getVisibleSpaces } from '../storage/auth.js';
import {
  getAllCategories,
  isCustomCategory,
  deleteCustomCategory,
  moveCategory,
  getCurrentSpaceKey,
  setCurrentSpaceKey,
} from '../storage/settings.js';

export async function renderLibraryView(container, { category } = {}) {
  if (category) {
    renderCategoryView(container, category);
  } else {
    renderFoldersView(container);
  }
}

async function renderFoldersView(container) {
  const visibleSpaces = await getVisibleSpaces();
  // Si el espacio actual ya no está entre los permitidos, lo corregimos
  // solo a la primera parroquia que sí puede tocar (ver misma lógica en
  // homeView.js — esta pantalla también se puede abrir directo, ej. desde
  // la barra inferior, sin pasar por la de inicio).
  if (!visibleSpaces.some((space) => space.key === getCurrentSpaceKey())) {
    setCurrentSpaceKey(visibleSpaces[0].key);
  }

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/inicio">← Inicio</a>
      <h2>Cancionero</h2>
      <a class="btn btn-accent" href="#/song/new">+ Nueva canción</a>
    </div>
    <div class="library-search">
      <input type="text" id="search-input" placeholder="Buscar en todas las categorías..." />
    </div>
    <div id="library-content"></div>
  `;

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
        // Esperamos a que el borrado quede confirmado en el servidor antes
        // de repintar/sincronizar — si no, una sincronización que llegue
        // primero puede "resucitar" la canción recién borrada.
        if (deleted) await propagateDelete(deleted);
        renderResultsOrFolders();
        syncNow();
      }
    } else if (deleteCategory) {
      if (confirm(`¿Eliminar la carpeta "${deleteCategory}"? Las canciones no se borran, solo dejan de tener esa etiqueta.`)) {
        const spaceKey = getCurrentSpaceKey();
        deleteCustomCategory(spaceKey, deleteCategory);
        renderResultsOrFolders();
        pushCustomCategoryDeletion(spaceKey, deleteCategory); // en segundo plano
      }
    } else if (moveUp) {
      moveCategory(getCurrentSpaceKey(), moveUp, 'up');
      renderResultsOrFolders();
    } else if (moveDown) {
      moveCategory(getCurrentSpaceKey(), moveDown, 'down');
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
        const cats = getAllCategories(getCurrentSpaceKey());
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
      if (deleted) await propagateDelete(deleted);
      refresh(searchInput.value);
      syncNow();
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
