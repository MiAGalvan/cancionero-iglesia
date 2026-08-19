// "Novedades": avisos, eventos y lecturas del día — no son canciones, así
// que no viven en el cancionero ni en la lista de misa. Se publican directo
// a Supabase (tabla `anuncios`, misma tabla que lee la página pública), no
// hay versión offline: para crear/editar/borrar hace falta conexión y
// sesión iniciada, igual que "Publicar". La lectura (para ver lo que ya hay
// cargado) funciona sin login, porque la tabla es de lectura pública.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSession } from '../storage/auth.js';
import { getCurrentSpaceKey, getSpaceLabel, getSpace, updateSpace } from '../storage/settings.js';
import { pushSpace } from '../storage/spacesSync.js';

// Estos 4 títulos, EXACTOS, son los que reconoce la página pública para
// mostrarlos siempre en el orden de la misa en "Lecturas" (ver
// pagina-publica/app.js) — los botones de acá evitan que alguien los tipee
// mal a mano.
const LECTURAS_TITULOS = ['1ª Lectura', 'Salmo', '2ª Lectura', 'Evangelio'];

// Mismo orden que Date.getDay() (0 = domingo), para que "día" se pueda
// guardar como número y usarse tal cual del lado de la página pública.
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export async function renderNovedadesView(container) {
  const space = getCurrentSpaceKey();
  const session = await getSession();
  const loggedIn = Boolean(session);
  const espacio = getSpace(space);

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Novedades — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Avisos, eventos o las lecturas del día, para que la gente los vea en
        la página del QR junto con los cantos.
      </p>
      ${
        !isSupabaseConfigured
          ? `<div class="warning-box">Falta configurar Supabase en <code>src/storage/supabaseClient.js</code>.</div>`
          : !loggedIn
          ? `<div class="warning-box">
              Iniciá sesión para poder crear o editar novedades.
              <a href="#/login?returnTo=${encodeURIComponent('/novedades')}">Ingresar</a>
            </div>`
          : ''
      }
      <div id="novedad-status" class="warning-box" hidden></div>

      <div class="categories-field">
        <span class="categories-label">📅 Próxima misa y dirección (se ve en "¿Vas a misa hoy?")</span>
        <label>
          Próxima misa (día y hora, tal cual la querés ver)
          <input type="text" id="next-mass-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.nextMass || '')}" placeholder="Ej. Miércoles 19 de agosto, 19:00 hs" />
        </label>
        <label>
          Dirección
          <input type="text" id="address-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.address || '')}" placeholder="Ej. Av San Martín 936, Ushuaia" />
        </label>
      </div>

      <div class="categories-field">
        <span class="categories-label">🗓️ Horario semanal (opcional, se repite todas las semanas — si cargás esto, la página pública calcula sola la próxima misa y ya no usa el texto de arriba)</span>
        <div id="horario-rows"></div>
        <div class="form-actions">
          <button type="button" class="btn" id="add-horario-row-btn" ${loggedIn ? '' : 'disabled'}>+ Agregar horario</button>
        </div>
      </div>

      <div class="categories-field">
        <span class="categories-label">⛪ Otras capillas de esta parroquia (solo informativo: nombre, dirección y horario — sin cancionero propio)</span>
        <ul class="song-list" id="capillas-list"></ul>
        <div class="form-actions">
          <button type="button" class="btn" id="add-capilla-btn" ${loggedIn ? '' : 'disabled'}>+ Agregar capilla</button>
        </div>
      </div>

      <div class="categories-field">
        <span class="categories-label">🔗 Redes sociales (se ve al fondo de "Inicio", y tiene su propio link para compartir)</span>
        <label>
          Instagram
          <input type="url" id="instagram-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.instagram || '')}" placeholder="Ej. https://instagram.com/tuparroquia" />
        </label>
        <label>
          Facebook
          <input type="url" id="facebook-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.facebook || '')}" placeholder="Ej. https://facebook.com/tuparroquia" />
        </label>
        <label>
          YouTube
          <input type="url" id="youtube-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.youtube || '')}" placeholder="Ej. https://youtube.com/@tuparroquia" />
        </label>
        <label>
          WhatsApp
          <input type="url" id="whatsapp-input" ${loggedIn ? '' : 'disabled'}
            value="${escapeAttr(espacio?.whatsapp || '')}" placeholder="Ej. https://wa.me/5490000000000" />
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-accent" id="save-mass-btn" ${loggedIn ? '' : 'disabled'}>Guardar</button>
        </div>
      </div>

      <div class="categories-field">
        <span class="categories-label">🙏 Lecturas (de hoy o de una misa programada, con fecha)</span>
        <div class="form-actions">
          ${LECTURAS_TITULOS.map(
            (titulo) => `<button type="button" class="btn" data-lectura="${escapeAttr(titulo)}" ${loggedIn ? '' : 'disabled'}>${escapeHtml(titulo)}</button>`
          ).join('')}
        </div>
      </div>

      <div id="novedad-form-wrap"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="add-btn" ${loggedIn ? '' : 'disabled'}>
          + Nuevo anuncio
        </button>
      </div>
      <ul class="song-list" id="novedades-list"></ul>
    </div>
  `;

  const listEl = container.querySelector('#novedades-list');
  const statusEl = container.querySelector('#novedad-status');
  const formWrap = container.querySelector('#novedad-form-wrap');
  let cachedAnuncios = [];

  // Cada acción de guardado (próxima misa/redes/horario, o capillas) lee el
  // espacio FRESCO de localStorage en vez de la constante `espacio` de más
  // arriba (que quedó congelada en como estaba al abrir la pantalla) — así,
  // si ya se guardó algo en esta misma visita, un guardado posterior no lo
  // pisa con datos viejos.
  function guardarCambiosEspacio(cambios) {
    const actual = getSpace(space) || espacio;
    const updated = updateSpace(space, {
      label: actual.label,
      locality: actual.locality,
      province: actual.province,
      address: actual.address,
      nextMass: actual.nextMass,
      instagram: actual.instagram,
      facebook: actual.facebook,
      youtube: actual.youtube,
      whatsapp: actual.whatsapp,
      horarioMisas: actual.horarioMisas || [],
      capillas: actual.capillas || [],
      ...cambios,
    });
    if (updated) pushSpace(updated); // en segundo plano, no bloquea la pantalla
    return updated;
  }

  // --- Horario semanal (se repite cada semana) ---
  let horarioMisas = Array.isArray(espacio?.horarioMisas) ? [...espacio.horarioMisas] : [];
  const horarioRowsEl = container.querySelector('#horario-rows');

  function horarioRowHtml(row, i) {
    return `
      <div class="misa-category-row" data-idx="${i}">
        <select class="horario-dia-select" data-idx="${i}" ${loggedIn ? '' : 'disabled'}>
          ${DIAS_SEMANA.map((d, di) => `<option value="${di}" ${row.dia === di ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <input type="time" class="horario-hora-input" data-idx="${i}" value="${escapeAttr(row.hora || '11:00')}" ${loggedIn ? '' : 'disabled'} />
        <button type="button" class="btn btn-danger btn-icon" data-del-horario="${i}" ${loggedIn ? '' : 'disabled'}>✕</button>
      </div>
    `;
  }

  function renderHorarioRows() {
    horarioRowsEl.innerHTML =
      horarioMisas.length === 0
        ? `<p class="song-artist">Sin horario semanal cargado — se usa el texto de "Próxima misa" de arriba.</p>`
        : horarioMisas.map(horarioRowHtml).join('');
  }

  // Los <select>/<input> de cada fila se editan directo en el DOM (no en el
  // array) — esto vuelca esos cambios al array antes de agregar/borrar una
  // fila o guardar, para no perderlos.
  function sincronizarHorarioDesdeDom() {
    horarioRowsEl.querySelectorAll('.misa-category-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.idx);
      const dia = Number(rowEl.querySelector('.horario-dia-select').value);
      const hora = rowEl.querySelector('.horario-hora-input').value || '11:00';
      horarioMisas[idx] = { dia, hora };
    });
  }

  renderHorarioRows();

  container.querySelector('#add-horario-row-btn').addEventListener('click', () => {
    sincronizarHorarioDesdeDom();
    horarioMisas.push({ dia: 0, hora: '11:00' });
    renderHorarioRows();
  });

  horarioRowsEl.addEventListener('click', (event) => {
    const idx = event.target.dataset.delHorario;
    if (idx === undefined) return;
    sincronizarHorarioDesdeDom();
    horarioMisas.splice(Number(idx), 1);
    renderHorarioRows();
  });

  container.querySelector('#save-mass-btn')?.addEventListener('click', () => {
    sincronizarHorarioDesdeDom();
    const updated = guardarCambiosEspacio({
      address: container.querySelector('#address-input').value,
      nextMass: container.querySelector('#next-mass-input').value,
      instagram: container.querySelector('#instagram-input').value,
      facebook: container.querySelector('#facebook-input').value,
      youtube: container.querySelector('#youtube-input').value,
      whatsapp: container.querySelector('#whatsapp-input').value,
      horarioMisas,
    });
    if (updated) {
      statusEl.hidden = false;
      statusEl.textContent = '✓ Guardado.';
    }
  });

  // --- Otras capillas (informativo: nombre, dirección, horario en texto) ---
  let capillas = Array.isArray(espacio?.capillas) ? [...espacio.capillas] : [];
  const capillasListEl = container.querySelector('#capillas-list');

  function capillaId() {
    return `capilla-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function renderCapillas() {
    if (capillas.length === 0) {
      capillasListEl.innerHTML = `<li class="empty-state">Todavía no agregaste ninguna capilla.</li>`;
      return;
    }
    capillasListEl.innerHTML = capillas
      .map(
        (c) => `
      <li class="song-item" data-id="${c.id}">
        <span>
          <strong>${escapeHtml(c.nombre)}</strong>
          <span class="song-artist">${escapeHtml([c.horario, c.direccion].filter(Boolean).join(' — '))}</span>
        </span>
        ${
          loggedIn
            ? `<button type="button" class="btn btn-icon" data-edit-capilla="${c.id}" title="Editar">✏️</button>
               <button type="button" class="btn btn-danger btn-icon" data-del-capilla="${c.id}" title="Eliminar">✕</button>`
            : ''
        }
      </li>`
      )
      .join('');
  }

  renderCapillas();

  container.querySelector('#add-capilla-btn').addEventListener('click', () => {
    const nombre = prompt('Nombre de la capilla');
    if (nombre === null || !nombre.trim()) return;
    const direccion = prompt('Dirección', '') || '';
    const horario = prompt('Horario (ej. Domingos 11:00 hs)', '') || '';
    capillas = [...capillas, { id: capillaId(), nombre: nombre.trim(), direccion, horario }];
    const updated = guardarCambiosEspacio({ capillas });
    if (updated) renderCapillas();
  });

  capillasListEl.addEventListener('click', (event) => {
    const editId = event.target.dataset.editCapilla;
    const delId = event.target.dataset.delCapilla;

    if (editId) {
      const c = capillas.find((x) => x.id === editId);
      if (!c) return;
      const nombre = prompt('Nombre de la capilla', c.nombre);
      if (nombre === null || !nombre.trim()) return;
      const direccion = prompt('Dirección', c.direccion || '');
      if (direccion === null) return;
      const horario = prompt('Horario (ej. Domingos 11:00 hs)', c.horario || '');
      if (horario === null) return;
      capillas = capillas.map((x) => (x.id === editId ? { ...x, nombre: nombre.trim(), direccion, horario } : x));
      const updated = guardarCambiosEspacio({ capillas });
      if (updated) renderCapillas();
    } else if (delId) {
      if (!confirm('¿Eliminar esta capilla?')) return;
      capillas = capillas.filter((x) => x.id !== delId);
      const updated = guardarCambiosEspacio({ capillas });
      if (updated) renderCapillas();
    }
  });

  container.querySelectorAll('[data-lectura]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const titulo = btn.dataset.lectura;
      const existing = cachedAnuncios.find((a) => a.titulo === titulo);
      openForm({ id: existing?.id, titulo, cuerpo: existing?.cuerpo || '', fecha: existing?.fecha || hoyIso() });
    });
  });

  function showError(err) {
    statusEl.textContent =
      err?.code === '42501'
        ? 'Tu usuario no tiene permiso para editar novedades de esta parroquia.'
        : `No se pudo guardar: ${err?.message || err}`;
    statusEl.hidden = false;
  }

  async function load() {
    const { data, error } = await supabase
      .from('anuncios')
      .select('id, titulo, cuerpo, fecha, updated_at')
      .eq('space', space)
      .order('updated_at', { ascending: false });

    if (error) {
      listEl.innerHTML = `<li class="empty-state">No se pudo cargar (revisá la conexión).</li>`;
      return;
    }
    cachedAnuncios = data || [];
    if (cachedAnuncios.length === 0) {
      listEl.innerHTML = `<li class="empty-state">Todavía no hay novedades cargadas para esta parroquia.</li>`;
      return;
    }
    listEl.innerHTML = cachedAnuncios.map(novedadItemHtml).join('');
  }

  function novedadItemHtml(novedad) {
    return `
      <li class="song-item novedad-item" data-id="${novedad.id}">
        <span>
          <strong>${escapeHtml(novedad.titulo)}</strong>${
            novedad.fecha
              ? ` <span class="category-tag">${escapeHtml(formatFechaCorta(novedad.fecha))}</span>`
              : ''
          }
          <span class="song-artist">${escapeHtml(novedad.cuerpo)}</span>
        </span>
        ${
          loggedIn
            ? `<button type="button" class="btn btn-icon" data-edit="${novedad.id}" title="Editar">✏️</button>
               <button type="button" class="btn btn-danger btn-icon" data-delete="${novedad.id}" title="Eliminar">✕</button>`
            : ''
        }
      </li>`;
  }

  function closeForm() {
    formWrap.innerHTML = '';
  }

  function openForm(existing) {
    statusEl.hidden = true;
    // El campo de fecha solo aparece para las 4 lecturas (título exacto):
    // un aviso común (ej. "Tallarineada") no necesita una fecha propia, la
    // fecha ya suele ir en el texto. Para una lectura, en cambio, es lo que
    // permite distinguir si es la de hoy o la de una misa programada (ej.
    // el domingo próximo) cargada con anticipación.
    const esLectura = LECTURAS_TITULOS.includes(existing?.titulo);
    formWrap.innerHTML = `
      <form id="novedad-form" class="novedad-form">
        <label>
          Título
          <input type="text" id="novedad-titulo" maxlength="120" required value="${escapeAttr(existing?.titulo || '')}" placeholder="Ej. VIACRUCIS VIERNES 15 HS" />
        </label>
        ${
          esLectura
            ? `<label>
                Fecha de esta lectura (para saber si es de hoy o de una misa programada)
                <input type="date" id="novedad-fecha" value="${escapeAttr(existing?.fecha || hoyIso())}" />
              </label>`
            : ''
        }
        <label>
          Detalle
          <textarea id="novedad-cuerpo" rows="4" placeholder="Ej. En las inmediaciones de la capilla. Se ruega puntualidad.">${escapeHtml(existing?.cuerpo || '')}</textarea>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-accent">Guardar</button>
          <button type="button" class="btn" id="cancel-btn">Cancelar</button>
        </div>
      </form>
    `;

    formWrap.querySelector('#cancel-btn').addEventListener('click', closeForm);
    formWrap.querySelector('#novedad-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const titulo = formWrap.querySelector('#novedad-titulo').value.trim();
      const cuerpo = formWrap.querySelector('#novedad-cuerpo').value.trim();
      if (!titulo) return;

      const payload = { space, titulo, cuerpo, updated_at: new Date().toISOString() };
      const fechaInput = formWrap.querySelector('#novedad-fecha');
      if (fechaInput) payload.fecha = fechaInput.value || null;

      const { error } = existing?.id
        ? await supabase.from('anuncios').update(payload).eq('id', existing.id)
        : await supabase.from('anuncios').insert(payload);

      if (error) {
        showError(error);
        return;
      }
      closeForm();
      await load();
    });
  }

  container.querySelector('#add-btn').addEventListener('click', () => openForm(null));

  listEl.addEventListener('click', async (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;

    if (editId) {
      const { data } = await supabase.from('anuncios').select('id, titulo, cuerpo, fecha').eq('id', editId).single();
      if (data) openForm(data);
    } else if (deleteId) {
      if (!confirm('¿Eliminar esta novedad?')) return;
      const { error } = await supabase.from('anuncios').delete().eq('id', deleteId);
      if (error) {
        showError(error);
        return;
      }
      await load();
    }
  });

  await load();
}

// Fecha local (no UTC) en formato YYYY-MM-DD, para que coincida con lo que
// espera un <input type="date"> y con cómo la página pública compara "hoy".
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFechaCorta(fecha) {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
