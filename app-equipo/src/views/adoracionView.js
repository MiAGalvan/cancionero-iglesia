// Configuración de la Hora Santa / Adoración al Santísimo de esta
// parroquia: día y horario semanal, lugar, el texto corto de invitación
// que se ve al escanear el QR de Adoración, y los cantos sugeridos. Vive
// en su propia pantalla (no dentro de Novedades) porque es una actividad
// bien distinta de la misa, con su propio QR y su propia página pública
// (ver pagina-publica/app.js, renderAdoracion).
//
// El resto de la guía (Preparación, Oración inicial, Lectura del día,
// Reflexión del día, Intenciones, Bendición) NO se edita acá: los 4
// primeros son automáticos (mismo trabajo de madrugada que ya trae las
// lecturas de la misa — ver pagina-publica/api/sync-lecturas.js) y los
// textos de oración fijos son iguales en cualquier parroquia (viven
// directo en el código de la página pública, como los rezos tradicionales
// que son).
import { getSession } from '../storage/auth.js';
import { getCurrentSpaceKey, getSpaceLabel, getSpace, updateSpace } from '../storage/settings.js';
import { pushSpace } from '../storage/spacesSync.js';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const TIPOS_CANCION = [
  { value: 'cancionero', label: 'Está en el cancionero' },
  { value: 'buscar', label: 'Sugerido, buscarlo afuera' },
  { value: 'equipo', label: 'Lo canta el equipo, sin grabación' },
];

const INVITACION_SUGERIDA =
  'Un momento para estar en silencio frente a Jesús presente en la Eucaristía. Esto es solo una invitación — te esperamos en la capilla.';

export async function renderAdoracionView(container) {
  const space = getCurrentSpaceKey();
  const session = await getSession();
  const loggedIn = Boolean(session);
  const espacio = getSpace(space);

  let dia = typeof espacio?.adoracionDia === 'number' ? espacio.adoracionDia : null;
  let canciones = Array.isArray(espacio?.adoracionCanciones) ? [...espacio.adoracionCanciones] : [];

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Adoración — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Configurá acá el día/horario, el lugar y el texto de invitación que
        se ve al escanear el QR de Adoración. La lectura, la reflexión del
        día y las oraciones de la guía se arman solas — no hace falta
        cargarlas.
      </p>
      ${
        loggedIn
          ? ''
          : `<div class="warning-box">
              Iniciá sesión para poder editar esto.
              <a href="#/login?returnTo=${encodeURIComponent('/adoracion')}">Ingresar</a>
            </div>`
      }
      <div id="adoracion-status" class="warning-box" hidden></div>

      <div class="categories-field">
        <span class="categories-label">🗓️ Día y horario</span>
        <div class="misa-category-row horario-row-doble">
          <select id="adoracion-dia-select" ${loggedIn ? '' : 'disabled'}>
            <option value="">Sin configurar</option>
            ${DIAS_SEMANA.map((d, di) => `<option value="${di}" ${dia === di ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <input type="time" id="adoracion-hora-input" value="${escapeAttr(espacio?.adoracionHora || '18:00')}" ${loggedIn ? '' : 'disabled'} />
          <span class="horario-hasta">hasta</span>
          <input type="time" id="adoracion-horafin-input" value="${escapeAttr(espacio?.adoracionHoraFin || '')}" ${loggedIn ? '' : 'disabled'} />
        </div>
      </div>

      <div class="categories-field">
        <span class="categories-label">📍 Lugar (si es distinto a la dirección de la misa)</span>
        <input type="text" id="adoracion-lugar-input" ${loggedIn ? '' : 'disabled'}
          value="${escapeAttr(espacio?.adoracionLugar || '')}" placeholder="${escapeAttr(espacio?.address || 'Ej. Capilla lateral')}" />
      </div>

      <div class="categories-field">
        <span class="categories-label">💬 Reflexión de invitación (lo primero que se ve al escanear el QR — cortito, invitando a ir)</span>
        <textarea id="adoracion-invitacion-input" rows="3" ${loggedIn ? '' : 'disabled'}
          placeholder="${escapeAttr(INVITACION_SUGERIDA)}">${escapeHtml(espacio?.adoracionInvitacion || '')}</textarea>
      </div>

      <div class="categories-field">
        <span class="categories-label">🎵 Cantos sugeridos (para intercalar durante la hora)</span>
        <ul class="song-list" id="adoracion-canciones-list"></ul>
        <div class="form-actions">
          <button type="button" class="btn" id="add-cancion-btn" ${loggedIn ? '' : 'disabled'}>+ Agregar canto</button>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="save-adoracion-btn" ${loggedIn ? '' : 'disabled'}>Guardar</button>
      </div>
    </div>
  `;

  const statusEl = container.querySelector('#adoracion-status');
  const listEl = container.querySelector('#adoracion-canciones-list');

  function tipoLabel(value) {
    return TIPOS_CANCION.find((t) => t.value === value)?.label || value;
  }

  function cancionId() {
    return `cancion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function renderCanciones() {
    listEl.innerHTML =
      canciones.length === 0
        ? `<li class="empty-state">Todavía no agregaste ningún canto sugerido.</li>`
        : canciones
            .map(
              (c) => `
      <li class="song-item" data-id="${c.id}">
        <span>
          <strong>${escapeHtml(c.titulo)}</strong>
          <span class="song-artist">${escapeHtml(tipoLabel(c.tipo))}</span>
        </span>
        ${
          loggedIn
            ? `<button type="button" class="btn btn-icon" data-edit-cancion="${c.id}" title="Editar">✏️</button>
               <button type="button" class="btn btn-danger btn-icon" data-del-cancion="${c.id}" title="Eliminar">✕</button>`
            : ''
        }
      </li>`
            )
            .join('');
  }

  renderCanciones();

  container.querySelector('#add-cancion-btn').addEventListener('click', () => {
    const titulo = prompt('Título del canto');
    if (titulo === null || !titulo.trim()) return;
    const opciones = TIPOS_CANCION.map((t, i) => `${i + 1}) ${t.label}`).join('\n');
    const eleccion = prompt(`¿Dónde está?\n${opciones}\n\nEscribí el número`, '1');
    if (eleccion === null) return;
    const idx = Number(eleccion) - 1;
    const tipo = TIPOS_CANCION[idx]?.value || TIPOS_CANCION[0].value;
    canciones = [...canciones, { id: cancionId(), titulo: titulo.trim(), tipo }];
    renderCanciones();
  });

  listEl.addEventListener('click', (event) => {
    const editId = event.target.dataset.editCancion;
    const delId = event.target.dataset.delCancion;

    if (editId) {
      const c = canciones.find((x) => x.id === editId);
      if (!c) return;
      const titulo = prompt('Título del canto', c.titulo);
      if (titulo === null || !titulo.trim()) return;
      const opciones = TIPOS_CANCION.map((t, i) => `${i + 1}) ${t.label}`).join('\n');
      const actual = TIPOS_CANCION.findIndex((t) => t.value === c.tipo) + 1;
      const eleccion = prompt(`¿Dónde está?\n${opciones}\n\nEscribí el número`, String(actual || 1));
      if (eleccion === null) return;
      const idx = Number(eleccion) - 1;
      const tipo = TIPOS_CANCION[idx]?.value || c.tipo;
      canciones = canciones.map((x) => (x.id === editId ? { ...x, titulo: titulo.trim(), tipo } : x));
      renderCanciones();
    } else if (delId) {
      if (!confirm('¿Eliminar este canto sugerido?')) return;
      canciones = canciones.filter((x) => x.id !== delId);
      renderCanciones();
    }
  });

  container.querySelector('#save-adoracion-btn')?.addEventListener('click', () => {
    const actual = getSpace(space) || espacio;
    const diaValue = container.querySelector('#adoracion-dia-select').value;
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
      adoracionDia: diaValue === '' ? null : Number(diaValue),
      adoracionHora: container.querySelector('#adoracion-hora-input').value || '',
      adoracionHoraFin: container.querySelector('#adoracion-horafin-input').value || '',
      adoracionLugar: container.querySelector('#adoracion-lugar-input').value || '',
      adoracionInvitacion: container.querySelector('#adoracion-invitacion-input').value || '',
      adoracionCanciones: canciones,
    });
    if (updated) {
      pushSpace(updated); // en segundo plano, no bloquea la pantalla
      statusEl.hidden = false;
      statusEl.textContent = '✓ Guardado.';
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
