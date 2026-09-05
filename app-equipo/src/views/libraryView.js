// Vista de las carpetas: las 12 litúrgicas fijas, en su orden, más las
// carpetas que el equipo haya agregado; al entrar a una se ve la lista de
// canciones de esa categoría. Como una canción puede tener varias
// categorías, puede aparecer repetida en más de una carpeta — es lo
// esperado (ej. un canto de Comunión que también se usa de Meditación). El
// buscador de esta pantalla busca en toda la biblioteca, sin importar la
// categoría. La pantalla de inicio (parroquia, título, accesos varios) vive
// en homeView.js — acá solo carpetas y canciones.
import { searchSongs, deleteSong, getAllSongs, getSongsByCategory, getSong, updateSong } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { pushCustomCategoryDeletion } from '../storage/labelsSync.js';
import { getVisibleSpaces, getSession } from '../storage/auth.js';
import { getPublicSongsForSpace } from '../storage/publicCancionero.js';
import { CATEGORIES } from '../storage/constants.js';
import {
  getAllCategories,
  isCustomCategory,
  deleteCustomCategory,
  moveCategory,
  getCurrentSpaceKey,
  setCurrentSpaceKey,
  getDeviceGroup,
  getModoLectura,
} from '../storage/settings.js';

export async function renderLibraryView(container, { category } = {}) {
  if (category) {
    renderCategoryView(container, category);
  } else {
    renderFoldersView(container);
  }
}

// Sin sesión no hay ningún orden de carpetas guardado a mano para mirar
// (eso vive en el localStorage de CADA dispositivo del equipo, ver
// settings.js) — mejor esfuerzo: las 12 fijas en su orden de siempre,
// y cualquier otra carpeta que el equipo haya agregado (ej. "NAVIDAD",
// del cancionero en papel importado), alfabética al final.
function categoriasDesdeCanciones(songs) {
  const presentes = new Set();
  for (const song of songs) {
    for (const cat of song.categories || []) presentes.add(cat);
  }
  const fijas = CATEGORIES.filter((cat) => presentes.has(cat));
  const extras = [...presentes].filter((cat) => !CATEGORIES.includes(cat)).sort((a, b) => a.localeCompare(b, 'es'));
  return [...fijas, ...extras];
}

function avisoSinSesionHtml(returnTo) {
  return `<div class="warning-box">
    Estás viendo el cancionero sin iniciar sesión: podés buscar y ver canciones, pero no crear, editar ni borrar nada.
    <a href="#/login?returnTo=${encodeURIComponent(returnTo)}">Ingresar</a>
  </div>`;
}

async function renderFoldersView(container) {
  // Sin sesión, no se puede crear/editar/borrar ni siquiera local — es la
  // base de seguridad; el modo lectura es una restricción EXTRA para
  // cuando sí hay sesión pero se quiere prestar el dispositivo igual. Sin
  // sesión SÍ se puede buscar y ver (más abajo, getPublicSongsForSpace) —
  // antes ni eso: un dispositivo que nunca sincronizó veía todo vacío.
  const loggedIn = Boolean(await getSession());
  const puedeEditar = loggedIn && !getModoLectura();
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
      ${puedeEditar ? `<a class="btn btn-accent" href="#/song/new">+ Nueva canción</a>` : '<span></span>'}
    </div>
    ${loggedIn ? '' : avisoSinSesionHtml('/library')}
    <div class="library-search">
      <input type="text" id="search-input" placeholder="Buscar en todas las categorías..." />
    </div>
    <div id="library-content"></div>
  `;

  const searchInput = container.querySelector('#search-input');
  const contentEl = container.querySelector('#library-content');
  // Sin sesión, se trae UNA vez de la nube (no hay nada local en un
  // dispositivo nuevo) y de ahí se arma todo en memoria — con sesión sigue
  // exactamente como siempre, todo local/IndexedDB, sin tocar la red acá.
  const publicSongsPromise = loggedIn ? null : getPublicSongsForSpace(getCurrentSpaceKey());

  // Un solo listener delegado: sirve para los botones "eliminar" de
  // canciones, carpetas y resultados de búsqueda, sin importar cuántas
  // veces se vuelva a pintar #library-content.
  contentEl.addEventListener('click', async (event) => {
    if (!puedeEditar) return; // ningún botón de editar/borrar/mover existe en el HTML, pero por las dudas
    const deleteId = event.target.dataset.delete;
    const deleteCategory = event.target.dataset.deleteCategory;
    const moveUp = event.target.dataset.moveUp;
    const moveDown = event.target.dataset.moveDown;
    const moveSongId = event.target.dataset.move;
    if (moveSongId) {
      abrirSelectorCategorias(moveSongId, renderResultsOrFolders);
    } else if (deleteId) {
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
      if (!loggedIn) {
        const songs = await publicSongsPromise;
        if (!query) {
          const counts = {};
          for (const song of songs) {
            for (const cat of song.categories || []) counts[cat] = (counts[cat] || 0) + 1;
          }
          const cats = categoriasDesdeCanciones(songs);
          contentEl.innerHTML = `
            <ul class="folder-list">
              ${cats
                .map(
                  (cat) => `
                <li>
                  <a class="folder-item" href="#/library/${encodeURIComponent(cat)}">
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${escapeHtml(cat)}</span>
                    <span class="folder-count">${counts[cat] || 0}</span>
                  </a>
                </li>`
                )
                .join('')}
            </ul>
          `;
          return;
        }
        const needle = query.toLowerCase();
        const filtered = songs.filter(
          (song) =>
            song.title.toLowerCase().includes(needle) ||
            (song.artist || '').toLowerCase().includes(needle) ||
            (song.tags || []).some((tag) => tag.toLowerCase().includes(needle))
        );
        contentEl.innerHTML = songSearchResultsHtml(filtered, false);
        return;
      }

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
                ${
                  puedeEditar
                    ? `<span class="folder-move">
                        <button class="btn btn-icon" data-move-up="${escapeAttr(cat)}" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button class="btn btn-icon" data-move-down="${escapeAttr(cat)}" title="Bajar" ${i === cats.length - 1 ? 'disabled' : ''}>▼</button>
                      </span>`
                    : ''
                }
                <a class="folder-item" href="#/library/${encodeURIComponent(cat)}">
                  <span class="folder-icon">📁</span>
                  <span class="folder-name">${escapeHtml(cat)}</span>
                  <span class="folder-count">${counts[cat] || 0}</span>
                </a>
                ${
                  puedeEditar && isCustomCategory(cat)
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
      contentEl.innerHTML = songSearchResultsHtml(songs, puedeEditar);
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
  const loggedIn = Boolean(await getSession());
  const puedeEditar = loggedIn && !getModoLectura();
  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Categorías</a>
      <h2>${escapeHtml(category)}</h2>
      ${puedeEditar ? `<a class="btn btn-accent" href="#/song/new/${encodeURIComponent(category)}">+ Nueva</a>` : '<span></span>'}
    </div>
    ${loggedIn ? '' : avisoSinSesionHtml('/library')}
    <div class="library-search">
      <input type="text" id="search-input" placeholder="Buscar en ${escapeHtml(category)}..." />
    </div>
    <ul class="song-list" id="song-list"></ul>
  `;

  const searchInput = container.querySelector('#search-input');
  const listEl = container.querySelector('#song-list');
  const publicSongsPromise = loggedIn ? null : getPublicSongsForSpace(getCurrentSpaceKey());

  listEl.addEventListener('click', async (event) => {
    if (!puedeEditar) return;
    const deleteId = event.target.dataset.delete;
    const moveSongId = event.target.dataset.move;
    if (moveSongId) {
      abrirSelectorCategorias(moveSongId, () => refresh(searchInput.value));
      return;
    }
    if (!deleteId) return;
    if (confirm('¿Eliminar esta canción?')) {
      const deleted = await deleteSong(Number(deleteId));
      if (deleted) await propagateDelete(deleted);
      refresh(searchInput.value);
      syncNow();
    }
  });

  async function refresh(query = '') {
    const songs = loggedIn
      ? await getSongsByCategory(category, getCurrentSpaceKey())
      : (await publicSongsPromise).filter((song) => (song.categories || []).includes(category));
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? songs.filter(
          (song) =>
            song.title.toLowerCase().includes(needle) ||
            (song.artist || '').toLowerCase().includes(needle) ||
            (song.tags || []).some((tag) => tag.toLowerCase().includes(needle))
        )
      : songs;

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">No hay canciones acá todavía.</li>`;
      return;
    }
    listEl.innerHTML = filtered.map((song) => songItemHtml(song, puedeEditar)).join('');
  }

  searchInput.addEventListener('input', () => refresh(searchInput.value));
  refresh();
}

function songSearchResultsHtml(songs, puedeEditar) {
  if (songs.length === 0) {
    return `<div class="empty-state">No se encontraron canciones.</div>`;
  }
  return `<ul class="song-list">${songs.map((song) => songItemHtml(song, puedeEditar)).join('')}</ul>`;
}

function songItemHtml(song, puedeEditar) {
  // Sin sesión, las canciones vienen de la nube (ver publicCancionero.js)
  // con su uuid, no con el id numérico local — el link a #/song/:id tiene
  // que servir para los dos casos (songView.js prueba primero local por
  // número, y si no encuentra nada, prueba de nuevo como uuid público).
  const songId = song.id ?? song.uuid;
  return `
    <li class="song-item" data-id="${escapeAttr(songId)}">
      <a href="#/song/${encodeURIComponent(songId)}">
        ${escapeHtml(song.title || '(sin título)')}
        <span class="song-artist">
          ${escapeHtml(song.artist || '')}
          ${(song.categories || []).map((cat) => `<span class="category-tag">${escapeHtml(cat)}</span>`).join('')}
          ${(song.tags || []).map((tag) => `<span class="liturgical-tag">🕊️ ${escapeHtml(tag)}</span>`).join('')}
        </span>
      </a>
      ${
        puedeEditar
          ? `<button class="btn btn-icon" data-move="${songId}" title="Mover a otra carpeta">📁</button>
             <button class="btn btn-danger btn-icon" data-delete="${songId}" title="Eliminar">✕</button>`
          : ''
      }
    </li>`;
}

// Selector rápido de carpetas/categorías, sin pasar por el formulario
// completo de edición — pensado sobre todo para reubicar de a poco las
// canciones que quedaron importadas en una carpeta "provisoria" (ej. las
// de Cuaresma/Navidad del cancionero en papel, que el libro agrupa por
// época y no por momento de la misa, así que nadie sabía todavía si van
// en la Entrada, la Comunión, etc.). Una canción puede quedar en más de
// una carpeta a la vez (checkboxes, no un único valor).
async function abrirSelectorCategorias(songId, onGuardado) {
  const song = await getSong(Number(songId));
  if (!song) return;
  const categorias = getAllCategories(getCurrentSpaceKey());

  const overlay = document.createElement('div');
  overlay.className = 'category-picker-overlay';
  overlay.innerHTML = `
    <div class="category-picker">
      <h3>Mover — ${escapeHtml(song.title || '(sin título)')}</h3>
      <p class="chord-editor-hint">Elegí a qué carpeta o carpetas pertenece.</p>
      <div class="category-picker-list">
        ${categorias
          .map(
            (cat) => `
          <label class="category-picker-item">
            <input type="checkbox" value="${escapeAttr(cat)}" ${song.categories.includes(cat) ? 'checked' : ''} />
            ${escapeHtml(cat)}
          </label>`
          )
          .join('')}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="category-picker-save">Guardar</button>
        <button type="button" class="btn" id="category-picker-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) cerrar();
  });
  overlay.querySelector('#category-picker-cancel').addEventListener('click', cerrar);
  overlay.querySelector('#category-picker-save').addEventListener('click', async () => {
    const nuevasCategorias = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
    await updateSong(song.id, {
      title: song.title,
      artist: song.artist,
      categories: nuevasCategorias,
      chordpro: song.chordpro,
      shared: song.shared,
      tags: song.tags,
      updatedBy: getDeviceGroup() || null,
    });
    cerrar();
    syncNow(); // en segundo plano
    onGuardado();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
