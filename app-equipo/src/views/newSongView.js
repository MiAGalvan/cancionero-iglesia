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
import { openFullscreenTextEditor } from '../editor/fullscreenTextEditor.js';
import { recognizeTextFromImage } from '../ocr/ocrText.js';
import { saveSong, updateSong, getSong } from '../storage/db.js';
import { syncNow } from '../storage/sync.js';
import { getSession } from '../storage/auth.js';
import { getAllCategories, getAllTags, addCustomTag, getCurrentSpaceKey, getDeviceGroup, getModoLectura } from '../storage/settings.js';
import { pushCustomTag } from '../storage/labelsSync.js';

export async function renderNewSongView(container, { editId, presetCategory, returnTo } = {}) {
  // Sin sesión, NO se puede crear/editar nada — ni siquiera local (antes sí
  // se podía, sin login, algo que quedó como hueco de seguridad real: ver
  // más abajo en songView.js/libraryView.js/misaListView.js el mismo
  // criterio). El modo lectura es una restricción EXTRA para cuando sí hay
  // sesión pero se quiere prestar el dispositivo igual.
  const session = await getSession();
  if (!session || getModoLectura()) {
    const volver = returnTo || (editId ? `#/song/${editId}` : '#/library');
    container.innerHTML = `
      <div class="topbar">
        <a class="btn" href="${volver}">← Volver</a>
        <h2>${session ? 'Modo lectura' : 'Iniciá sesión'}</h2>
        <span></span>
      </div>
      <div class="empty-state">
        ${
          session
            ? 'Este dispositivo está en modo lectura — no se pueden crear ni editar canciones. Desactivalo desde Inicio si necesitás cargar o corregir algo.'
            : `Hace falta iniciar sesión para crear o editar canciones. <a href="#/login?returnTo=${encodeURIComponent(
                '/library'
              )}">Ingresar</a>`
        }
      </div>
    `;
    return;
  }
  const existing = editId ? await getSong(Number(editId)) : null;
  const selectedCategories = existing ? existing.categories : presetCategory ? [presetCategory] : [];
  const categoryOptions = getAllCategories(existing?.space || getCurrentSpaceKey());
  const selectedTags = existing ? existing.tags || [] : [];

  // Una canción ya escrita casi siempre se sigue editando "a mano" (tocando
  // acordes); una canción nueva lo más común es traerla pegada de una web.
  let mode = existing ? 'write' : 'paste';

  // Si se entró a editar desde otro lugar que no es la biblioteca (ej. "Ver
  // publicada"), se vuelve ahí mismo al cancelar o guardar, en vez de
  // siempre terminar en la vista simple de la canción.
  const returnToQuery = returnTo ? `?returnTo=${encodeURIComponent(returnTo.replace(/^#/, ''))}` : '';

  container.innerHTML = `
    <div class="topbar">
      <h2>${existing ? 'Editar canción' : 'Nueva canción'}</h2>
      <a class="btn" href="${existing ? `#/song/${existing.id}${returnToQuery}` : '#/library'}">Cancelar</a>
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

      <div class="categories-field">
        <span class="categories-label">
          Tiempo/tema litúrgico (opcional — sin ninguno tildado, sirve para cualquier época)
        </span>
        <div class="categories-checkboxes" id="tags-checkboxes"></div>
        <button type="button" class="btn" id="add-tag-btn">+ Agregar tiempo o tema</button>
      </div>

      <label class="shared-field">
        <input type="checkbox" id="shared-input" ${(existing ? existing.shared : true) ? 'checked' : ''} />
        Compartir con otras parroquias (recomendado — desmarcá solo si esta canción en particular tiene que quedar privada)
      </label>

      <div class="mode-tabs">
        <button type="button" class="mode-tab" data-mode-tab="paste">Pegar o foto</button>
        <button type="button" class="mode-tab" data-mode-tab="write">Escribir y poner acordes</button>
      </div>
      <div id="mode-content"></div>

      <div class="textarea-field-header">
        <label for="chordpro-input">ChordPro (se arma solo con lo de arriba; revisá o corregí acá si hace falta)</label>
        <button type="button" class="btn btn-icon expand-textarea-btn" data-expand-target="chordpro-input" data-expand-title="ChordPro" title="Editar en pantalla completa">⛶</button>
      </div>
      <textarea id="chordpro-input" rows="12">${existing ? escapeHtml(existing.chordpro) : ''}</textarea>

      <div class="form-actions">
        <button class="btn btn-accent" id="save-btn">Guardar</button>
      </div>
    </div>
  `;

  const chordproInput = container.querySelector('#chordpro-input');
  const modeContentEl = container.querySelector('#mode-content');
  const tabButtons = container.querySelectorAll('[data-mode-tab]');
  const tagsCheckboxesEl = container.querySelector('#tags-checkboxes');
  let currentTags = [...selectedTags];

  // Delegado en `container` (no en cada textarea puntual) porque
  // #paste-input se vuelve a crear cada vez que se repinta #mode-content
  // (cambiar de pestaña, sacar/poner la foto) — un listener puesto directo
  // ahí quedaría huérfano en el próximo repintado.
  container.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-expand-target]');
    if (!btn) return;
    const targetId = btn.dataset.expandTarget;
    const textarea = container.querySelector(`#${targetId}`);
    if (!textarea) return;
    openFullscreenTextEditor({
      title: btn.dataset.expandTitle || '',
      initialValue: textarea.value,
      placeholder: textarea.placeholder,
      onSave: (value) => {
        textarea.value = value;
        // Por si algo escucha 'input' en esta caja (ninguna lo hace hoy,
        // pero es gratis y evita un bug sutil si mañana se agrega uno).
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      },
    });
  });

  function renderTagCheckboxes() {
    tagsCheckboxesEl.innerHTML = getAllTags()
      .map(
        (tag) => `
        <label class="category-checkbox">
          <input type="checkbox" name="tag" value="${escapeAttr(tag)}" ${
          currentTags.includes(tag) ? 'checked' : ''
        } />
          ${escapeHtml(tag)}
        </label>`
      )
      .join('');
  }
  renderTagCheckboxes();

  tagsCheckboxesEl.addEventListener('change', () => {
    currentTags = Array.from(tagsCheckboxesEl.querySelectorAll('input[name="tag"]:checked')).map(
      (input) => input.value
    );
  });

  container.querySelector('#add-tag-btn').addEventListener('click', () => {
    const nombre = prompt('Nombre del tiempo o tema litúrgico (ej. "Bautismo", "Confirmación")');
    if (nombre === null || !nombre.trim()) return;
    addCustomTag(nombre);
    currentTags = [...currentTags, nombre.trim()];
    renderTagCheckboxes();
    pushCustomTag(nombre.trim()); // en segundo plano, no bloquea la pantalla
  });

  function updateTabsUI() {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.modeTab === mode);
    });
  }

  function renderModeContent() {
    if (mode === 'paste') {
      modeContentEl.innerHTML = `
        <div class="ocr-field">
          <label>
            📷 O convertí una foto de un papel (necesita internet la primera vez que se usa)
            <input type="file" accept="image/*" id="photo-input" />
          </label>
          <div class="form-actions">
            <button type="button" class="btn" id="ocr-btn" disabled>Reconocer texto de la foto</button>
          </div>
          <div id="ocr-status" class="warning-box" hidden></div>
        </div>
        <div class="textarea-field-header">
          <label for="paste-input">Pegá acá la letra con acordes (tal cual la copiaste de la web, o el texto de una foto)</label>
          <button type="button" class="btn btn-icon expand-textarea-btn" data-expand-target="paste-input" data-expand-title="Letra pegada" title="Editar en pantalla completa">⛶</button>
        </div>
        <textarea id="paste-input" rows="10" placeholder="Am          E7&#10;Perdón, oh Dios, perdón e indulgencia..."></textarea>
        <div class="form-actions">
          <button type="button" class="btn" id="convert-btn">Convertir a ChordPro</button>
        </div>
      `;
      modeContentEl.querySelector('#convert-btn').addEventListener('click', () => {
        const pasteInput = modeContentEl.querySelector('#paste-input');
        if (!pasteInput.value.trim()) return;
        chordproInput.value = pastedTextToChordPro(pasteInput.value);
      });

      const photoInput = modeContentEl.querySelector('#photo-input');
      const ocrBtn = modeContentEl.querySelector('#ocr-btn');
      const ocrStatus = modeContentEl.querySelector('#ocr-status');

      photoInput.addEventListener('change', () => {
        ocrBtn.disabled = !photoInput.files.length;
      });

      ocrBtn.addEventListener('click', async () => {
        const file = photoInput.files[0];
        if (!file) return;
        ocrBtn.disabled = true;
        ocrStatus.hidden = false;
        ocrStatus.textContent = 'Leyendo la imagen... puede tardar un rato, sobre todo la primera vez.';
        try {
          const text = await recognizeTextFromImage(file, {
            onProgress: (m) => {
              if (m.status === 'recognizing text') {
                ocrStatus.textContent = `Leyendo la imagen... ${Math.round((m.progress || 0) * 100)}%`;
              }
            },
          });
          modeContentEl.querySelector('#paste-input').value = text;
          ocrStatus.textContent =
            '✓ Listo. El reconocimiento no es perfecto — revisá el texto de abajo y corregilo antes de convertir a ChordPro.';
        } catch (err) {
          console.error(err);
          ocrStatus.textContent = 'No se pudo leer la imagen. Probá con otra foto, con más luz o más nítida.';
        } finally {
          ocrBtn.disabled = false;
        }
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
    const shared = container.querySelector('#shared-input').checked;

    if (!title || !chordpro) {
      alert('Falta el título o el contenido de la canción.');
      return;
    }
    if (categories.length === 0) {
      alert('Elegí al menos una categoría litúrgica.');
      return;
    }

    // El grupo del dispositivo (ej. "CORO SÁBADO") es más útil que el
    // email cuando varios grupos comparten un solo login de parroquia. Sin
    // grupo configurado ni sesión, queda sin autoría — no bloquea guardar,
    // es solo un dato informativo para el equipo.
    const session = await getSession();
    const updatedBy = getDeviceGroup() || session?.user?.email || null;

    const saved = existing
      ? await updateSong(existing.id, { title, artist, categories, chordpro, shared, tags: currentTags, updatedBy })
      : await saveSong({
          title,
          artist,
          categories,
          chordpro,
          shared,
          tags: currentTags,
          updatedBy,
          space: getCurrentSpaceKey(),
        });

    window.location.hash = `#/song/${saved.id}${returnToQuery}`;
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
