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
        <span class="categories-label">🙏 Lecturas de hoy</span>
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

  container.querySelector('#save-mass-btn')?.addEventListener('click', () => {
    const nextMass = container.querySelector('#next-mass-input').value;
    const address = container.querySelector('#address-input').value;
    const instagram = container.querySelector('#instagram-input').value;
    const facebook = container.querySelector('#facebook-input').value;
    const youtube = container.querySelector('#youtube-input').value;
    const whatsapp = container.querySelector('#whatsapp-input').value;
    const updated = updateSpace(space, {
      label: espacio.label,
      locality: espacio.locality,
      province: espacio.province,
      address,
      nextMass,
      instagram,
      facebook,
      youtube,
      whatsapp,
    });
    if (updated) {
      pushSpace(updated); // en segundo plano, no bloquea la pantalla
      statusEl.hidden = false;
      statusEl.textContent = '✓ Guardado.';
    }
  });

  container.querySelectorAll('[data-lectura]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const titulo = btn.dataset.lectura;
      const existing = cachedAnuncios.find((a) => a.titulo === titulo);
      openForm({ id: existing?.id, titulo, cuerpo: existing?.cuerpo || '' });
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
      .select('id, titulo, cuerpo, updated_at')
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
