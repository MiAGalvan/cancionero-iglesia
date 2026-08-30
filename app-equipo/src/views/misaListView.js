// "Armar lista de misa": para una fecha, elegir una o más canciones por
// cada una de las categorías (las 12 litúrgicas fijas, más las carpetas
// que el equipo haya agregado) — o dejarla vacía si ese día no aplica, ej.
// no siempre hay "Entrada de la Palabra". Se guarda en IndexedDB, 100%
// offline; publicarla a la nube es un paso aparte (ver publicarView.js).
//
// `misa.items[categoria]` es un array de ids de canciones locales (puede
// tener más de una — ej. dos cantos de Comunión seguidos) — o, en misas
// guardadas antes de que existiera esto, un solo id o null; se normaliza
// con toIdArray() al leerlo, sin necesidad de migrar nada guardado.
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

function toIdArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function songLabel(song) {
  return song.title + (song.artist ? ` — ${song.artist}` : '');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderMisaListView(container, { fecha } = {}) {
  const selectedFecha = fecha || todayIso();
  const space = getCurrentSpaceKey();
  const categories = getAllCategories(space);

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

      <p class="chord-editor-hint">
        Escribí para buscar y tocá una canción para agregarla — se puede
        agregar más de una en la misma categoría (quedan una debajo de la
        otra, en el orden en que las agregaste).
      </p>
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
      .map((cat, i) => renderCategoryRow(cat, songsByCategory[i], toIdArray(selections[cat])))
      .join('');
  }

  function readCurrentSelections() {
    const selections = {};
    for (const cat of categories) {
      const picker = categoriesWrapEl.querySelector(`.song-picker[data-category="${cssEscape(cat)}"]`);
      // OJO: el selector tiene que apuntar solo a los chips ya agregados
      // (".song-picker-chip [data-song-id]"), no a cualquier
      // "[data-song-id]" — las opciones del desplegable TAMBIÉN tienen ese
      // atributo y siguen en el DOM aunque estén ocultas (dropdown.hidden
      // solo las tapa visualmente), así que un selector más amplio termina
      // agarrando canciones que nunca se eligieron.
      const chips = picker ? Array.from(picker.querySelectorAll('.song-picker-chip [data-song-id]')) : [];
      selections[cat] = chips.map((el) => Number(el.dataset.songId));
    }
    return selections;
  }

  // Mapa categoría -> sus canciones, para que el buscador de cada fila
  // filtre en memoria mientras se escribe, sin volver a pedir nada.
  const songsPorCategoria = new Map(categories.map((cat, i) => [cat, songsByCategory[i]]));

  // --- Buscador desplegable de cada fila (reemplaza al <select> nativo:
  // con 300+ canciones importadas, un <select> no deja escribir para
  // filtrar, sobre todo en tablet/celular) y permite agregar más de una
  // canción por categoría, en vez de una sola. Un solo listener delegado
  // por tipo de evento en vez de uno por fila: como renderCategories()
  // vuelve a pintar todo el HTML seguido (al cambiar el filtro de tiempo
  // litúrgico, al traer la última publicada), listeners puestos fila por
  // fila quedarían huérfanos cada vez.
  function cerrarDropdown(picker) {
    const dropdown = picker.querySelector('.song-picker-dropdown');
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  function idsYaElegidas(picker) {
    return new Set(Array.from(picker.querySelectorAll('.song-picker-chip [data-song-id]')).map((el) => Number(el.dataset.songId)));
  }

  function abrirDropdown(picker, texto) {
    const category = picker.dataset.category;
    const songs = songsPorCategoria.get(category) || [];
    const yaElegidas = idsYaElegidas(picker);
    const needle = texto.trim().toLowerCase();
    const disponibles = songs.filter((song) => !yaElegidas.has(song.id) && songMatchesFilter(song, filterTag));
    const filtradas = needle
      ? disponibles.filter(
          (song) => song.title.toLowerCase().includes(needle) || (song.artist || '').toLowerCase().includes(needle)
        )
      : disponibles;

    const dropdown = picker.querySelector('.song-picker-dropdown');
    dropdown.innerHTML = `
      ${filtradas
        .slice(0, 60)
        .map(
          (song) => `
        <button type="button" class="song-picker-option" data-song-id="${song.id}" data-song-label="${escapeAttr(songLabel(song))}">
          ${escapeHtml(songLabel(song))}
        </button>`
        )
        .join('')}
      ${filtradas.length === 0 ? `<p class="song-picker-empty">No hay canciones que coincidan.</p>` : ''}
      ${filtradas.length > 60 ? `<p class="song-picker-empty">Y ${filtradas.length - 60} más — seguí escribiendo para acotar.</p>` : ''}
    `;
    dropdown.hidden = false;
  }

  categoriesWrapEl.addEventListener('input', (event) => {
    if (!event.target.classList.contains('song-picker-input')) return;
    abrirDropdown(event.target.closest('.song-picker'), event.target.value);
  });

  categoriesWrapEl.addEventListener(
    'focus',
    (event) => {
      if (!event.target.classList.contains('song-picker-input')) return;
      abrirDropdown(event.target.closest('.song-picker'), '');
    },
    true // captura: 'focus' no burbujea
  );

  // mousedown (no click) para que dispare ANTES que el blur del input —
  // si fuera click, el blur cierra el desplegable primero y el click nunca
  // llega a encontrar el botón.
  categoriesWrapEl.addEventListener('mousedown', (event) => {
    const option = event.target.closest('.song-picker-option');
    if (!option) return;
    event.preventDefault(); // no le saques el foco al input todavía
    const picker = option.closest('.song-picker');
    const chipsWrap = picker.querySelector('.song-picker-chips');
    chipsWrap.insertAdjacentHTML(
      'beforeend',
      `<span class="song-picker-chip">
        ${escapeHtml(option.dataset.songLabel)}
        <button type="button" class="song-picker-chip-remove" data-song-id="${option.dataset.songId}" title="Quitar">✕</button>
      </span>`
    );
    const input = picker.querySelector('.song-picker-input');
    input.value = '';
    abrirDropdown(picker, ''); // refresca la lista sin la que se acaba de agregar
  });

  categoriesWrapEl.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('.song-picker-chip-remove');
    if (!removeBtn) return;
    removeBtn.closest('.song-picker-chip').remove();
  });

  categoriesWrapEl.addEventListener(
    'blur',
    (event) => {
      if (!event.target.classList.contains('song-picker-input')) return;
      event.target.value = '';
      cerrarDropdown(event.target.closest('.song-picker'));
    },
    true // captura: 'blur' no burbujea
  );

  renderCategories(items);

  tagFilterEl.addEventListener('change', () => {
    // Guardamos lo que ya se había elegido en pantalla (aunque todavía no
    // se haya tocado "Guardar lista") para que cambiar el filtro no borre
    // selecciones en curso — y en renderCategoryRow nos aseguramos de que
    // las canciones ya elegidas sigan apareciendo como chip aunque no
    // tengan la etiqueta del filtro nuevo.
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
    // (que trabaja con el id local, no con el uuid). Si no se encuentra
    // (ej. este dispositivo todavía no sincronizó esa canción), esa
    // canción puntual queda afuera en vez de romper el resto de la
    // importación. Si una categoría tenía más de una canción publicada,
    // todas quedan agregadas, no solo la última.
    const newSelections = {};
    for (const item of data[0].items) {
      const local = item.song_uuid ? await getSongByUuid(item.song_uuid) : null;
      if (!local) continue;
      if (!newSelections[item.categoria]) newSelections[item.categoria] = [];
      newSelections[item.categoria].push(local.id);
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

function renderCategoryRow(category, songs, selectedIds) {
  const seleccionadas = selectedIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  return `
    <div class="misa-category-row misa-category-row-multi">
      <span class="misa-category-name">${escapeHtml(category)}</span>
      <div class="song-picker" data-category="${escapeAttr(category)}">
        <div class="song-picker-chips">
          ${seleccionadas
            .map(
              (song) => `
            <span class="song-picker-chip">
              ${escapeHtml(songLabel(song))}
              <button type="button" class="song-picker-chip-remove" data-song-id="${song.id}" title="Quitar">✕</button>
            </span>`
            )
            .join('')}
        </div>
        <input type="text" class="song-picker-input" placeholder="+ Agregar canción..." autocomplete="off" />
        <div class="song-picker-dropdown" hidden></div>
      </div>
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
