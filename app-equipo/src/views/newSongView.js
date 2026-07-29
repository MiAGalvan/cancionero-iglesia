// Vista para dar de alta una canción nueva (o editar una existente). Hay dos
// formas de cargar la letra con acordes, elegibles con las pestañas de
// arriba:
//  - "Pegar de la web": convierte automáticamente una letra ya copiada de
//    internet (acordes alineados arriba de la letra) a formato ChordPro.
//  - "Escribir y poner acordes": para canciones nuevas escritas por el
//    equipo — se tipea la letra y después se toca cada palabra para
//    ponerle el acorde que va arriba (ver editor/chordEditorWidget.js).
// Las dos formas terminan escribiendo en el mismo textarea de ChordPro de
// abajo, que es lo único que "Guardar" realmente lee — así ninguna de las
// dos rompe a la otra ni duplica la lógica de guardado.
// Una canción puede pertenecer a varias categorías litúrgicas a la vez (ej.
// sirve para Comunión y también para Meditación), por eso son checkboxes y
// no un <select> de una sola opción.
import { pastedTextToChordPro } from '../parser/chordProParser.js';
import { renderChordEditor } from '../editor/chordEditorWidget.js';
import { saveSong, updateSong, getSong } from '../storage/db.js';
import { syncNow } from '../storage/sync.js';
import { getAllCategories, getCurrentSpaceKey } from '../storage/settings.js';

export async function renderNewSongView(container, { editId, presetCategory } = {}) {
  const existing = editId ? await getSong(Number(editId)) : null;
  const selectedCategories = existing ? existing.categories : presetCategory ? [presetCategory] : [];
  const categoryOptions = getAllCategories();

  // Una canción ya escrita casi siempre se sigue editando "a mano" (tocando
  // acordes); una canción nueva lo más común es traerla pegada de una web.
  let mode = existing ? 'write' : 'paste';

  container.innerHTML = `
    <div class="topbar">
      <h2>${existing ? 'Editar canción' : 'Nueva canción'}</h2>
      <a class="btn" href="${existing ? `#/song/${existing.id}` : '#/library'}">Cancelar</a>
    </div>
    <div class="form-view">
      <label>
        Título
        <input type="text" id="title-input" value="${existing ? escapeAttr(existing.title) : ''}" />
      </label>
      <label>
        Artista / autor
        <input type="text" id="artist-input" value="${existing ? escapeAttr(existing.artist) : ''}" />
      </label>
      <div class="categories-field">
        <span class="categories-label">Categorías litúrgicas (una o más)</span>
        <div class="categories-checkboxes">
          ${categoryOptions.map(
            (cat) => `
            <label class="category-checkbox">
              <input type="checkbox" name="category" value="${escapeAttr(cat)}" ${
              selectedCategories.includes(cat) ? 'checked' : ''
            } />
              ${escapeHtml(cat)}
            </label>`
          ).join('')}
        </div>
      </div>

      <div class="mode-tabs">
        <button type="button" class="mode-tab" data-mode-tab="paste">Pegar de la web</button>
        <button type="button" class="mode-tab" data-mode-tab="write">Escribir y poner acordes</button>
      </div>
      <div id="mode-content"></div>

      <label>
        ChordPro (se arma solo con lo de arriba; revisá o corregí acá si hace falta)
        <textarea id="chordpro-input" rows="12">${existing ? escapeHtml(existing.chordpro) : ''}</textarea>
      </label>

      <div class="form-actions">
        <button class="btn btn-accent" id="save-btn">Guardar</button>
      </div>
    </div>
  `;

  const chordproInput = container.querySelector('#chordpro-input');
  const modeContentEl = container.querySelector('#mode-content');
  const tabButtons = container.querySelectorAll('[data-mode-tab]');

  function updateTabsUI() {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.modeTab === mode);
    });
  }

  function renderModeContent() {
    if (mode === 'paste') {
      modeContentEl.innerHTML = `
        <label>
          Pegá acá la letra con acordes (tal cual la copiaste de la web)
          <textarea id="paste-input" rows="10" placeholder="Am          E7&#10;Perdón, oh Dios, perdón e indulgencia..."></textarea>
        </label>
        <div class="form-actions">
          <button type="button" class="btn" id="convert-btn">Convertir a ChordPro</button>
        </div>
      `;
      modeContentEl.querySelector('#convert-btn').addEventListener('click', () => {
        const pasteInput = modeContentEl.querySelector('#paste-input');
        if (!pasteInput.value.trim()) return;
        chordproInput.value = pastedTextToChordPro(pasteInput.value);
      });
    } else {
      renderChordEditor(modeContentEl, {
        initialChordpro: chordproInput.value,
        onChordProChange: (newChordpro) => {
          chordproInput.value = newChordpro;
        },
      });
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.modeTab;
      updateTabsUI();
      renderModeContent();
    });
  });

  updateTabsUI();
  renderModeContent();

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const title = container.querySelector('#title-input').value.trim();
    const artist = container.querySelector('#artist-input').value.trim();
    const categories = Array.from(
      container.querySelectorAll('input[name="category"]:checked')
    ).map((input) => input.value);
    const chordpro = chordproInput.value.trim();

    if (!title || !chordpro) {
      alert('Falta el título o el contenido de la canción.');
      return;
    }
    if (categories.length === 0) {
      alert('Elegí al menos una categoría litúrgica.');
      return;
    }

    const saved = existing
      ? await updateSong(existing.id, { title, artist, categories, chordpro })
      : await saveSong({ title, artist, categories, chordpro, space: getCurrentSpaceKey() });

    window.location.hash = `#/song/${saved.id}`;
    // En segundo plano, sin bloquear la navegación: si hay sesión y
    // conexión, esto ya sube la canción para que aparezca en los demás
    // dispositivos del equipo. Si no, no hace nada — se sube la próxima
    // vez que alguien sincronice desde un dispositivo logueado.
    syncNow();
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
