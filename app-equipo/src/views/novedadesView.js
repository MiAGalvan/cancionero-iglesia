// "Novedades": avisos, eventos y lecturas del día — no son canciones, así
// que no viven en el cancionero ni en la lista de misa. Se publican directo
// a Supabase (tabla `anuncios`, misma tabla que lee la página pública), no
// hay versión offline: para crear/editar/borrar hace falta conexión y
// sesión iniciada, igual que "Publicar". La lectura (para ver lo que ya hay
// cargado) funciona sin login, porque la tabla es de lectura pública.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSession } from '../storage/auth.js';
import { getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';

export async function renderNovedadesView(container) {
  const space = getCurrentSpaceKey();
  const session = await getSession();
  const loggedIn = Boolean(session);

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Novedades — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Avisos, eventos o las lecturas del día, para que la gente los vea en
        la página del QR junto con los cantos — ej. "VIACRUCIS VIERNES 15
        HS" o "Lecturas del domingo" con la cita completa.
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
      .select('id, titulo, cuerpo, updated_at')
      .eq('space', space)
      .order('updated_at', { ascending: false });

    if (error) {
      listEl.innerHTML = `<li class="empty-state">No se pudo cargar (revisá la conexión).</li>`;
      return;
    }
    if (!data || data.length === 0) {
      listEl.innerHTML = `<li class="empty-state">Todavía no hay novedades cargadas para esta parroquia.</li>`;
      return;
    }
    listEl.innerHTML = data.map(novedadItemHtml).join('');
  }

  function novedadItemHtml(novedad) {
    return `
      <li class="song-item novedad-item" data-id="${novedad.id}">
        <span>
          <strong>${escapeHtml(novedad.titulo)}</strong>
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
    formWrap.innerHTML = `
      <form id="novedad-form" class="novedad-form">
        <label>
          Título
          <input type="text" id="novedad-titulo" maxlength="120" required value="${escapeAttr(existing?.titulo || '')}" placeholder="Ej. VIACRUCIS VIERNES 15 HS" />
        </label>
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
      const { error } = existing
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
      const { data } = await supabase.from('anuncios').select('id, titulo, cuerpo').eq('id', editId).single();
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
