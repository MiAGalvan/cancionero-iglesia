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
import { getSongsByCategory, getMisa, saveMisa, getAllMisas, getSongByUuid, getAllSongs } from '../storage/db.js';
import { filterSongs } from '../search/songSearch.js';
import { sugerirCanciones, FUENTES_POR_MOMENTO, ETIQUETA_FUENTE } from '../search/sugerencias.js';
import { traerDatosLiturgicos } from '../liturgia/datosLiturgicos.js';
import { getAllCategories, getAllTags, getCurrentSpaceKey, getSpaceLabel, getModoLectura, getIdentidad } from '../storage/settings.js';
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSession } from '../storage/auth.js';
import { syncMisasNow } from '../storage/misasSync.js';

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

function fechaIsoLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// La misa del sábado a la tarde (vigilia) ya lleva las lecturas del
// DOMINGO: para consultar lecturas y antífonas hay que pedir esa fecha, no
// la del sábado. 18:00 es el mismo corte que usa el cronograma para decir
// "misa vespertina".
function fechaLiturgicaDeMisa(fecha, hora) {
  const dia = new Date(`${fecha}T00:00:00`);
  if (dia.getDay() === 6 && hora && hora >= '18:00') {
    dia.setDate(dia.getDate() + 1);
    return fechaIsoLocal(dia);
  }
  return fecha;
}

// Sugerir de nuevo algo que se cantó hace poco es lo que más cansa: las
// canciones de las listas de las últimas 5 semanas (anteriores a esta misa)
// bajan de puntaje.
const SEMANAS_RECIENTES = 5;
function idsCantadosRecientemente(misas, fecha) {
  const hasta = new Date(`${fecha}T00:00:00`);
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - SEMANAS_RECIENTES * 7);
  const desdeIso = fechaIsoLocal(desde);
  const ids = new Set();
  for (const misa of misas) {
    if (misa.fecha < desdeIso || misa.fecha >= fecha) continue;
    for (const valor of Object.values(misa.items || {})) toIdArray(valor).forEach((id) => ids.add(id));
  }
  return ids;
}

// "En común con la misa: «pastor» (antífona de comunión), «mesa» (Evangelio)"
function motivoDeSugerencia(sugerencia, tiempo) {
  const partes = [];
  if (sugerencia.palabras.length) {
    const lista = sugerencia.palabras
      .map((p) => `«${escapeHtml(p.palabra)}» (${escapeHtml(ETIQUETA_FUENTE[p.fuente] || p.fuente)})`)
      .join(', ');
    partes.push(`En común con la misa: ${lista}`);
  }
  if (sugerencia.esDelTiempo) partes.push(`Es de ${escapeHtml(tiempo)}`);
  if (sugerencia.esReciente) partes.push('⏳ Se cantó hace poco');
  return partes.join(' · ');
}

// "Lista de Sábado 19 hs" en vez de pedirle a alguien que la titule a mano
// — se arma sola a partir de la fecha + el horario, así se ve igual en
// "Misas guardadas", al publicar y en la pantalla de ensayo (más adelante).
// Sin horario (parroquia con una sola misa por día), se deja el formato de
// siempre (solo la fecha).
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function tituloMisa(fecha, hora) {
  if (!hora) return formatFecha(fecha);
  const dia = DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `Lista de ${diaCapitalizado} ${hora} hs`;
}

// Para poder marcar cada misa guardada como "publicada ahora" / "ya
// publicada" / "por publicar" (ver renderMisasGuardadas) hace falta saber
// qué combinaciones fecha+horario de esta parroquia ya se subieron a
// Supabase — sin conexión, o si todavía no se configuró, ninguna se marca
// como publicada (mejor eso que romper la pantalla entera por esto).
async function getFechasHorasPublicadas(space) {
  if (!isSupabaseConfigured) return new Set();
  const { data, error } = await supabase.from('lista_actual').select('fecha, hora').eq('space', space);
  if (error || !data) return new Set();
  return new Set(data.map((row) => `${row.fecha}|${row.hora || ''}`));
}

export async function renderMisaListView(container, { fecha, hora } = {}) {
  const selectedFecha = fecha || todayIso();
  const selectedHora = hora || '';
  const space = getCurrentSpaceKey();
  const categories = getAllCategories(space);

  // Armar y guardar la lista (elegir canciones) NO pide sesión de verdad
  // si el dispositivo ya dijo "¿quién sos?" (ver cronogramaView.js) — para
  // poder ensayar el jueves con la lista del domingo sin que cada uno
  // tenga que loguearse. Queda guardada SOLO en este dispositivo hasta que
  // alguien CON sesión lo sincronice (syncMisasNow ya lo exige solo, ver
  // storage/misasSync.js) — publicar sigue pidiendo sesión de verdad
  // siempre, sin excepción (ver "publish-link" más abajo): éste sí es el
  // paso que hace falta cuidar, no elegir canciones de un cancionero que
  // ya es compartido dentro del equipo.
  const session = await getSession();
  const identidadConocida = getIdentidad(space);
  const tieneSesionReal = Boolean(session);
  const puedeEditar = (tieneSesionReal || Boolean(identidadConocida)) && !getModoLectura();

  const [existing, songsByCategory, allMisas, fechasHorasPublicadas] = await Promise.all([
    getMisa(space, selectedFecha, selectedHora),
    Promise.all(categories.map((cat) => getSongsByCategory(cat, space))),
    getAllMisas(space),
    getFechasHorasPublicadas(space),
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
        Horario (opcional — dejalo vacío si tu parroquia tiene una sola misa por día)
        <input type="time" id="hora-input" value="${escapeAttr(selectedHora)}" />
      </label>
      ${selectedHora ? `<p class="chord-editor-hint misa-titulo-generado">📋 ${escapeHtml(tituloMisa(selectedFecha, selectedHora))}</p>` : ''}

      <label>
        Filtrar por tiempo/tema litúrgico (acota las opciones de cada categoría)
        <select id="tag-filter">
          <option value="">Todas las canciones</option>
          ${getAllTags()
            .map((tag) => `<option value="${escapeAttr(tag)}">${escapeHtml(tag)}</option>`)
            .join('')}
        </select>
      </label>

      <details class="sugerencias-box" id="sugerencias-box">
        <summary>💡 Sugerencias para esta misa</summary>
        <div id="sugerencias-contenido" class="sugerencias-contenido"></div>
      </details>

      <div class="form-actions">
        <button type="button" class="btn" id="import-published-btn" ${isSupabaseConfigured && puedeEditar ? '' : 'disabled'}>
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

      ${
        puedeEditar && !tieneSesionReal
          ? `<div class="warning-box">✏️ Armando esta lista como <strong>${escapeHtml(
              identidadConocida
            )}</strong>, sin iniciar sesión — queda guardada en este dispositivo. Para publicarla vas a necesitar iniciar sesión.</div>`
          : ''
      }
      ${
        puedeEditar
          ? `<p class="chord-editor-hint">
        Escribí para buscar y tocá una canción para agregarla — se puede
        agregar más de una en la misma categoría (quedan una debajo de la
        otra, en el orden en que las agregaste).
      </p>`
          : `<div class="warning-box">${
              getModoLectura()
                ? '👁️ Modo lectura activado — se puede ver la lista, pero no armarla ni guardarla.'
                : `Hace falta iniciar sesión para armar y guardar la lista de misa (o elegir quién sos desde el <a href="#/cronograma">Cronograma</a>). <a href="#/login?returnTo=${encodeURIComponent(
                    '/library'
                  )}">Ingresar</a>`
            }</div>`
      }
      <div class="misa-categories" id="misa-categories-wrap"></div>

      <div class="form-actions">
        <button class="btn btn-accent" id="save-btn" ${puedeEditar ? '' : 'disabled'}>Guardar lista</button>
        ${
          tieneSesionReal
            ? `<a class="btn" id="publish-link" href="#/publicar/${selectedFecha}/${encodeURIComponent(selectedHora)}">Ir a publicar →</a>`
            : ''
        }
        ${
          Object.keys(items).length
            ? `<a class="btn" href="#/ensayar/${selectedFecha}/${encodeURIComponent(selectedHora)}">👁️ Ensayo (con acordes)</a>`
            : ''
        }
      </div>

      ${allMisas.length ? renderMisasGuardadas(allMisas, fechasHorasPublicadas, todayIso()) : ''}
    </div>
  `;

  const categoriesWrapEl = container.querySelector('#misa-categories-wrap');
  const tagFilterEl = container.querySelector('#tag-filter');
  let filterTag = '';

  function renderCategories(selections) {
    categoriesWrapEl.innerHTML = categories
      .map((cat, i) => renderCategoryRow(cat, songsByCategory[i], toIdArray(selections[cat]), puedeEditar))
      .join('');
    // Al repintar (cambiar el filtro, traer la última publicada) lo ya
    // elegido cambia: que los botones de "Sugerencias" lo reflejen.
    sincronizarBotonesSugerencias();
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
    const disponibles = songs.filter((song) => !yaElegidas.has(song.id) && songMatchesFilter(song, filterTag));
    const filtradas = filterSongs(disponibles, texto);

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
  function agregarChip(picker, songId, label) {
    picker.querySelector('.song-picker-chips').insertAdjacentHTML(
      'beforeend',
      `<span class="song-picker-chip">
        ${escapeHtml(label)}
        <button type="button" class="song-picker-chip-remove" data-song-id="${songId}" title="Quitar">✕</button>
      </span>`
    );
  }

  categoriesWrapEl.addEventListener('mousedown', (event) => {
    const option = event.target.closest('.song-picker-option');
    if (!option) return;
    event.preventDefault(); // no le saques el foco al input todavía
    const picker = option.closest('.song-picker');
    agregarChip(picker, option.dataset.songId, option.dataset.songLabel);
    const input = picker.querySelector('.song-picker-input');
    input.value = '';
    abrirDropdown(picker, ''); // refresca la lista sin la que se acaba de agregar
    sincronizarBotonesSugerencias();
  });

  categoriesWrapEl.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('.song-picker-chip-remove');
    if (!removeBtn) return;
    removeBtn.closest('.song-picker-chip').remove();
    sincronizarBotonesSugerencias();
  });

  // --- "Sugerencias para esta misa": ideas del cancionero según lo que se
  // lee ese día (ver search/sugerencias.js — sin IA, con un puntaje fijo). Se
  // piden recién cuando se abre la sección, no al entrar a la pantalla.
  // "Agregar" solo suma la canción a la lista en pantalla, igual que
  // elegirla del buscador: sigue haciendo falta "Guardar lista".
  const sugerenciasBoxEl = container.querySelector('#sugerencias-box');
  const sugerenciasEl = container.querySelector('#sugerencias-contenido');
  const momentosSugeribles = categories.filter((cat) => FUENTES_POR_MOMENTO[cat]);
  const fechaLiturgica = fechaLiturgicaDeMisa(selectedFecha, selectedHora);
  let sugerenciasCargadas = false;

  function sincronizarBotonesSugerencias() {
    sugerenciasEl.querySelectorAll('.sugerencia-agregar').forEach((btn) => {
      const picker = categoriesWrapEl.querySelector(`.song-picker[data-category="${cssEscape(btn.dataset.category)}"]`);
      const yaEsta = picker ? idsYaElegidas(picker).has(Number(btn.dataset.songId)) : false;
      btn.disabled = yaEsta;
      btn.textContent = yaEsta ? '✓ En la lista' : '+ Agregar';
    });
  }

  function pintarSugerencias(datos, todasLasCanciones) {
    const recientes = idsCantadosRecientemente(allMisas, selectedFecha);
    const bloques = momentosSugeribles.map((momento) => {
      const sugerencias = sugerirCanciones({
        momento,
        candidatas: songsPorCategoria.get(momento) || [],
        todasLasCanciones,
        fuentes: datos.fuentes,
        tiempo: datos.tiempo,
        recientes,
      });
      const filas = sugerencias.length
        ? sugerencias
            .map(
              (s) => `
        <div class="sugerencia-item">
          <div class="sugerencia-info">
            <span class="sugerencia-titulo">${escapeHtml(songLabel(s.song))}</span>
            <span class="sugerencia-motivo">${motivoDeSugerencia(s, datos.tiempo)}</span>
          </div>
          ${
            puedeEditar
              ? `<button type="button" class="btn sugerencia-agregar" data-category="${escapeAttr(momento)}" data-song-id="${s.song.id}" data-song-label="${escapeAttr(songLabel(s.song))}">+ Agregar</button>`
              : ''
          }
        </div>`
            )
            .join('')
        : `<p class="chord-editor-hint">Sin coincidencias claras en el cancionero para este momento.</p>`;
      return `<div class="sugerencia-momento"><h4>${escapeHtml(momento)}</h4>${filas}</div>`;
    });

    sugerenciasEl.innerHTML = `
      <p class="chord-editor-hint">
        ${datos.tituloDia ? `<strong>${escapeHtml(datos.tituloDia)}</strong>` : 'Lecturas del día'}${
      datos.tiempo ? ` · ${escapeHtml(datos.tiempo)}` : ''
    }${fechaLiturgica !== selectedFecha ? ` · misa de vigilia: se usan las lecturas del domingo ${formatFecha(fechaLiturgica)}` : ''}
      </p>
      ${datos.faltan.length ? `<div class="warning-box">No se pudieron traer: ${escapeHtml(datos.faltan.join(' ni '))}. Las sugerencias son más pobres sin eso.</div>` : ''}
      ${bloques.join('')}
      <p class="chord-editor-hint">
        Son ideas armadas con las palabras de las lecturas y las antífonas
        (sin inteligencia artificial): decide siempre el equipo.
        Las que dicen "Se cantó hace poco" aparecen más abajo a propósito.
      </p>
    `;
    sincronizarBotonesSugerencias();
  }

  async function cargarSugerencias() {
    sugerenciasEl.innerHTML = `<p class="chord-editor-hint">Buscando lecturas y armando ideas...</p>`;
    const [datos, todasLasCanciones] = await Promise.all([traerDatosLiturgicos(fechaLiturgica), getAllSongs(space)]);
    if (!datos.ok) {
      sugerenciasEl.innerHTML = `<p class="chord-editor-hint">Todavía no están disponibles las lecturas de esa fecha (o no hay conexión) — probá más cerca del día.</p>`;
      return;
    }
    pintarSugerencias(datos, todasLasCanciones);
    // Con el resultado completo no hace falta volver a pedir al reabrir.
    sugerenciasCargadas = datos.faltan.length === 0;
  }

  sugerenciasBoxEl.addEventListener('toggle', () => {
    if (sugerenciasBoxEl.open && !sugerenciasCargadas) cargarSugerencias();
  });

  sugerenciasEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.sugerencia-agregar');
    if (!btn || !puedeEditar) return;
    const picker = categoriesWrapEl.querySelector(`.song-picker[data-category="${cssEscape(btn.dataset.category)}"]`);
    if (!picker || idsYaElegidas(picker).has(Number(btn.dataset.songId))) return;
    agregarChip(picker, btn.dataset.songId, btn.dataset.songLabel);
    sincronizarBotonesSugerencias();
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
  const horaInput = container.querySelector('#hora-input');
  fechaInput.addEventListener('change', () => {
    window.location.hash = `#/misa/${fechaInput.value}/${encodeURIComponent(horaInput.value)}`;
  });
  horaInput.addEventListener('change', () => {
    window.location.hash = `#/misa/${fechaInput.value}/${encodeURIComponent(horaInput.value)}`;
  });

  const importStatusEl = container.querySelector('#import-status');

  container.querySelector('#import-published-btn').addEventListener('click', async () => {
    if (!puedeEditar) return;
    importStatusEl.hidden = true;
    const { data, error } = await supabase
      .from('lista_actual')
      .select('items')
      .eq('space', space)
      .eq('fecha', selectedFecha)
      .eq('hora', selectedHora)
      .limit(1);

    if (error || !data || data.length === 0) {
      importStatusEl.textContent = error
        ? 'No se pudo traer la lista publicada (revisá la conexión).'
        : `Todavía no se publicó ninguna lista para ${tituloMisa(selectedFecha, selectedHora)}.`;
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
    if (!puedeEditar) return;
    const newItems = readCurrentSelections();
    await saveMisa(space, fechaInput.value, horaInput.value, newItems);
    // Re-renderizamos la misma pantalla en vez de solo cambiar el hash, para
    // que "Misas guardadas" se actualice ya mismo aunque la fecha no haya
    // cambiado (un cambio de hash a la misma ruta no dispara el router).
    await renderMisaListView(container, { fecha: fechaInput.value, hora: horaInput.value });
    syncMisasNow(); // en segundo plano, para que le llegue rápido al resto del equipo
  });

  // Al entrar a esta pantalla, se sincroniza en segundo plano — así, si
  // alguien del equipo armó o cambió una lista desde otro dispositivo,
  // aparece acá sin que haga falta tocar nada. Si trajo algo nuevo,
  // repintamos "Misas guardadas" para que se note sin recargar la página.
  if (puedeEditar) {
    syncMisasNow().then((result) => {
      if (result.synced && result.pulled > 0) {
        renderMisaListView(container, { fecha: selectedFecha, hora: selectedHora });
      }
    });
  }
}

function renderCategoryRow(category, songs, selectedIds, puedeEditar) {
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
              <button type="button" class="song-picker-chip-remove" data-song-id="${song.id}" title="Quitar" ${
                puedeEditar ? '' : 'hidden'
              }>✕</button>
            </span>`
            )
            .join('')}
        </div>
        ${
          puedeEditar
            ? `<input type="text" class="song-picker-input" placeholder="+ Agregar canción..." autocomplete="off" />
               <div class="song-picker-dropdown" hidden></div>`
            : seleccionadas.length === 0
            ? `<p class="chord-editor-hint">— sin canciones —</p>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderMisasGuardadas(misas, fechasHorasPublicadas, hoy) {
  return `
    <div class="sidebar-group">
      <h3>Misas guardadas</h3>
      <ul class="song-list">
        ${misas
          .map((misa) => {
            const estado = estadoPublicacion(misa.fecha, misa.hora, fechasHorasPublicadas, hoy);
            const horaSegment = encodeURIComponent(misa.hora || '');
            return `
          <li class="song-item">
            <div class="misa-guardada-info">
              <a href="#/misa/${misa.fecha}/${horaSegment}">${escapeHtml(tituloMisa(misa.fecha, misa.hora))}</a>
              <span class="estado-badge ${estado.clase}">${estado.label}</span>
            </div>
            <a class="btn" href="#/publicar/${misa.fecha}/${horaSegment}">Publicar</a>
          </li>`;
          })
          .join('')}
      </ul>
    </div>
  `;
}

// "Publicada ahora": es HOY (ese mismo horario incluido) y está publicada —
// es la que ve la gente ahora mismo si escanea el QR. "Ya publicada": se
// publicó en algún momento (esta fecha+horario existe en Supabase) pero no
// es hoy — quedó como historial. "Por publicar": armada y guardada acá,
// pero todavía nunca se subió.
function estadoPublicacion(fecha, hora, fechasHorasPublicadas, hoy) {
  const clave = `${fecha}|${hora || ''}`;
  if (!fechasHorasPublicadas.has(clave)) return { label: 'Por publicar', clase: 'badge-por-publicar' };
  if (fecha === hoy) return { label: '🟢 Publicada ahora', clase: 'badge-publicada-ahora' };
  return { label: '✓ Ya publicada', clase: 'badge-ya-publicada' };
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
