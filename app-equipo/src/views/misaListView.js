// "Armar lista de misa": para una fecha, elegir UNA canción por cada una de
// las categorías (las 12 litúrgicas fijas, más las carpetas que el equipo
// haya agregado) — o dejarla vacía si ese día no aplica, ej. no siempre hay
// "Entrada de la Palabra". Se guarda en IndexedDB, 100% offline; publicarla
// a la nube es un paso aparte (ver publicarView.js).
import { getSongsByCategory, getMisa, saveMisa, getAllMisas, getSongByUuid } from '../storage/db.js';
import { getAllCategories, getAllTags, getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';

// Sin filtro, o si la canción no tiene ninguna etiqueta puesta ("sirve para
// cualquier época"), siempre se muestra — el filtro solo ESCONDE canciones
// que tienen etiquetas puestas y ninguna coincide con la elegida.
function songMatchesFilter(song, filterTag) {
  if (!filterTag) return true;
  if (!song.tags || song.tags.length === 0) return true;
  return song.tags.includes(filterTag);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderMisaListView(container, { fecha } = {}) {
  const selectedFecha = fecha || todayIso();
  const categories = getAllCategories();
  const space = getCurrentSpaceKey();

  const [existing, songsByCategory, allMisas] = await Promise.all([
    getMisa(space, selectedFecha),
    Promise.all(categories.map((cat) => getSongsByCategory(cat, space))),
    getAllMisas(space),
  ]);
  const items = existing ? existing.items : {};

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Lista de misa — ${escapeHtml(getSpaceLabel(space))}</h2>
      <a class="btn" href="#/qr">Ver QR</a>
    </div>
    <div class="form-view misa-view">
      <label>
        Fecha de la misa
        <input type="date" id="fecha-input" value="${selectedFecha}" />
      </label>

      <label>
        Filtrar por tiempo/tema litúrgico (acota las opciones de cada categoría)
        <select id="tag-filter">
          <option value="">Todas las canciones</option>
          ${getAllTags()
            .map((tag) => `<option value="${escapeAttr(tag)}">${escapeHtml(tag)}</option>`)
            .join('')}
        </select>
      </label>

      <div class="form-actions">
        <button type="button" class="btn" id="import-published-btn" ${isSupabaseConfigured ? '' : 'disabled'}>
          ⬇️ Traer la última publicada
        </button>
      </div>
      <p class="chord-editor-hint">
        Útil para un cambio rápido en el momento: trae las canciones tal
        cual quedaron en la última lista publicada, para que solo tengas
        que cambiar la que hace falta y volver a publicar, sin elegir todo
        de nuevo.
      </p>
      <div id="import-status" class="warning-box" hidden></div>

      <div class="misa-categories" id="misa-categories-wrap"></div>

      <div class="form-actions">
        <button class="btn btn-accent" id="save-btn">Guardar lista</button>
        <a class="btn" id="publish-link" href="#/publicar/${selectedFecha}">Ir a publicar →</a>
      </div>

      ${allMisas.length ? renderMisasGuardadas(allMisas) : ''}
    </div>
  `;

  const categoriesWrapEl = container.querySelector('#misa-categories-wrap');
  const tagFilterEl = container.querySelector('#tag-filter');
  let filterTag = '';

  function renderCategories(selections) {
    categoriesWrapEl.innerHTML = categories
      .map((cat, i) => renderCategoryRow(cat, songsByCategory[i], selections[cat], filterTag))
      .join('');
  }

  function readCurrentSelections() {
    const selections = {};
    for (const cat of categories) {
      const select = categoriesWrapEl.querySelector(`select[data-category="${cssEscape(cat)}"]`);
      selections[cat] = select && select.value ? Number(select.value) : null;
    }
    return selections;
  }

  renderCategories(items);

  tagFilterEl.addEventListener('change', () => {
    // Guardamos lo que ya se había elegido en pantalla (aunque todavía no
    // se haya tocado "Guardar lista") para que cambiar el filtro no borre
    // selecciones en curso — y en renderCategoryRow nos aseguramos de que
    // la canción ya elegida siga apareciendo en el desplegable aunque no
    // tenga la etiqueta del filtro nuevo.
    const selections = readCurrentSelections();
    filterTag = tagFilterEl.value;
    renderCategories(selections);
  });

  const fechaInput = container.querySelector('#fecha-input');
  fechaInput.addEventListener('change', () => {
    window.location.hash = `#/misa/${fechaInput.value}`;
  });

  const importStatusEl = container.querySelector('#import-status');

  container.querySelector('#import-published-btn').addEventListener('click', async () => {
    importStatusEl.hidden = true;
    const { data, error } = await supabase
      .from('lista_actual')
      .select('items')
      .eq('space', space)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      importStatusEl.textContent = error
        ? 'No se pudo traer la lista publicada (revisá la conexión).'
        : 'Todavía no se publicó ninguna lista para esta parroquia.';
      importStatusEl.hidden = false;
      return;
    }

    // Cada canción publicada viaja con su uuid — acá se busca esa misma
    // canción en el cancionero de ESTE dispositivo para poder seleccionarla
    // en el desplegable (que trabaja con el id local, no con el uuid). Si
    // no se encuentra (ej. este dispositivo todavía no sincronizó esa
    // canción), esa categoría queda sin seleccionar en vez de romper el
    // resto de la importación.
    const newSelections = {};
    for (const item of data[0].items) {
      const local = item.song_uuid ? await getSongByUuid(item.song_uuid) : null;
      newSelections[item.categoria] = local ? local.id : null;
    }
    renderCategories(newSelections);
    importStatusEl.textContent = '✓ Se trajeron las canciones de la última lista publicada. Cambiá lo que haga falta y volvé a publicar.';
    importStatusEl.hidden = false;
  });

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const newItems = readCurrentSelections();
    await saveMisa(space, fechaInput.value, newItems);
    // Re-renderizamos la misma pantalla en vez de solo cambiar el hash, para
    // que "Misas guardadas" se actualice ya mismo aunque la fecha no haya
    // cambiado (un cambio de hash a la misma ruta no dispara el router).
    await renderMisaListView(container, { fecha: fechaInput.value });
  });
}

function renderCategoryRow(category, songs, selectedSongId, filterTag) {
  const visibleSongs = songs.filter(
    (song) => songMatchesFilter(song, filterTag) || song.id === selectedSongId
  );
  return `
    <div class="misa-category-row">
      <span class="misa-category-name">${escapeHtml(category)}</span>
      <select data-category="${escapeAttr(category)}">
        <option value="">— (sin canción) —</option>
        ${visibleSongs
          .map(
            (song) => `
          <option value="${song.id}" ${song.id === selectedSongId ? 'selected' : ''}>
            ${escapeHtml(song.title)}${song.artist ? ` — ${escapeHtml(song.artist)}` : ''}
          </option>`
          )
          .join('')}
      </select>
    </div>
  `;
}

function renderMisasGuardadas(misas) {
  return `
    <div class="sidebar-group">
      <h3>Misas guardadas</h3>
      <ul class="song-list">
        ${misas
          .map(
            (misa) => `
          <li class="song-item">
            <a href="#/misa/${misa.fecha}">${formatFecha(misa.fecha)}</a>
            <a class="btn" href="#/publicar/${misa.fecha}">Publicar</a>
          </li>`
          )
          .join('')}
      </ul>
    </div>
  `;
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function cssEscape(text) {
  return text.replace(/"/g, '\\"');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
