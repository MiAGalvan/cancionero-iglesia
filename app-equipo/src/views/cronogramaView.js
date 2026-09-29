// "Cronograma": quién cubre cada misa de las próximas semanas, con acceso
// directo a las lecturas de ese fin de semana y a armar la lista de
// canciones de cada horario. Los horarios son siempre los mismos cada
// semana (Sábado 19hs, Domingo 12hs, Domingo 19hs) — no hay que cargarlos,
// se generan solos para las próximas semanas.
//
// "Quién cubre" se guarda en el MISMO registro que la lista de canciones de
// esa fecha+horario (ver storage/db.js, saveAsignados/getMisa) — no es una
// tabla aparte, así que ya viaja sincronizada entre dispositivos con la
// misma infraestructura de misasSync.js.
import { getMisa, saveAsignados } from '../storage/db.js';
import { getMiembros, addMiembro, deleteMiembro, getCurrentSpaceKey, getSpaceLabel, getModoLectura } from '../storage/settings.js';
import { pushMiembro, pushMiembroDeletion } from '../storage/labelsSync.js';
import { syncMisasNow } from '../storage/misasSync.js';
import { getSession } from '../storage/auth.js';
import { tituloMisa } from './misaListView.js';
import { PUBLIC_URL } from './qrView.js';

// Mismo criterio que el resto de la app: sin sesión (o en modo lectura) se
// puede VER el cronograma, pero no tocar nada.
const HORARIOS_FIJOS = [
  { dia: 6, hora: '19:00', label: 'Sábado' }, // 6 = sábado (Date.getDay())
  { dia: 0, hora: '12:00', label: 'Domingo' }, // 0 = domingo
  { dia: 0, hora: '19:00', label: 'Domingo' },
];

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Los próximos `n` fines de semana (sábado+domingo), empezando por el que
// viene — o el actual, si hoy ya es sábado o domingo (para no dejar afuera
// el fin de semana en curso).
function proximosFinesDeSemana(n) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diaHoy = hoy.getDay();
  const offsetASabado = diaHoy === 6 ? 0 : diaHoy === 0 ? -1 : 6 - diaHoy;
  const primerSabado = new Date(hoy);
  primerSabado.setDate(primerSabado.getDate() + offsetASabado);

  const fines = [];
  for (let i = 0; i < n; i++) {
    const sabado = new Date(primerSabado);
    sabado.setDate(sabado.getDate() + i * 7);
    const domingo = new Date(sabado);
    domingo.setDate(domingo.getDate() + 1);
    fines.push({ sabado: toIso(sabado), domingo: toIso(domingo) });
  }
  return fines;
}

const SEMANAS_A_MOSTRAR = 4;

export async function renderCronogramaView(container) {
  const puedeEditar = Boolean(await getSession()) && !getModoLectura();
  const space = getCurrentSpaceKey();
  const fines = proximosFinesDeSemana(SEMANAS_A_MOSTRAR);

  // Cada fin de semana tiene 3 horarios fijos, con su fecha real resuelta
  // (sábado o domingo según corresponda).
  const finesConSlots = fines.map((fin) => ({
    ...fin,
    slots: HORARIOS_FIJOS.map((h) => ({
      fecha: h.dia === 6 ? fin.sabado : fin.domingo,
      hora: h.hora,
      diaLabel: h.label,
    })),
  }));

  const [miembros, misasPorSlot] = await Promise.all([
    Promise.resolve(getMiembros(space)),
    Promise.all(
      finesConSlots.flatMap((fin) => fin.slots).map(async (slot) => [
        `${slot.fecha}|${slot.hora}`,
        await getMisa(space, slot.fecha, slot.hora),
      ])
    ),
  ]);
  const misaPorClave = new Map(misasPorSlot);

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Cronograma — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view cronograma-view">
      ${renderMiembrosSection(miembros, puedeEditar)}
      <div id="cronograma-sync-status" class="warning-box" hidden></div>
      ${finesConSlots.map((fin) => renderFinDeSemana(fin, miembros, misaPorClave, puedeEditar)).join('')}
    </div>
  `;

  const syncStatusEl = container.querySelector('#cronograma-sync-status');

  // --- Miembros del equipo: agregar / quitar ------------------------
  const miembroInput = container.querySelector('#miembro-input');
  container.querySelector('#miembro-add-btn')?.addEventListener('click', () => {
    const nombre = miembroInput.value.trim();
    if (!nombre) return;
    addMiembro(space, nombre);
    miembroInput.value = '';
    pushMiembro(space, nombre); // en segundo plano
    renderCronogramaView(container);
  });
  miembroInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') container.querySelector('#miembro-add-btn').click();
  });
  container.querySelectorAll('[data-remove-miembro]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.removeMiembro;
      if (!confirm(`¿Quitar a "${nombre}" de la lista de miembros?`)) return;
      deleteMiembro(space, nombre);
      pushMiembroDeletion(space, nombre); // en segundo plano
      renderCronogramaView(container);
    });
  });

  // --- Asignados por horario: picker tipo chip (mismo patrón visual que
  // el buscador de canciones de misaListView.js) --------------------
  if (puedeEditar) {
    container.querySelectorAll('[data-slot-picker]').forEach((picker) => {
      const [fecha, hora] = picker.dataset.slotPicker.split('|');
      const input = picker.querySelector('.song-picker-input');
      const dropdown = picker.querySelector('.song-picker-dropdown');
      const chipsWrap = picker.querySelector('.song-picker-chips');

      function yaElegidos() {
        return new Set(Array.from(chipsWrap.querySelectorAll('[data-nombre]')).map((el) => el.dataset.nombre));
      }

      async function guardar() {
        const asignados = Array.from(chipsWrap.querySelectorAll('[data-nombre]')).map((el) => el.dataset.nombre);
        await saveAsignados(space, fecha, hora, asignados);
        syncMisasNow(); // en segundo plano
      }

      function abrirDropdown(texto) {
        const elegidos = yaElegidos();
        const needle = texto.trim().toLowerCase();
        const disponibles = miembros.filter((m) => !elegidos.has(m) && (!needle || m.toLowerCase().includes(needle)));
        dropdown.innerHTML = disponibles
          .map((m) => `<button type="button" class="song-picker-option" data-nombre="${escapeAttr(m)}">${escapeHtml(m)}</button>`)
          .join('');
        dropdown.hidden = false;
      }

      input.addEventListener('input', () => abrirDropdown(input.value));
      input.addEventListener('focus', () => abrirDropdown(input.value));
      input.addEventListener('blur', () => {
        input.value = '';
        setTimeout(() => {
          dropdown.hidden = true;
          dropdown.innerHTML = '';
        }, 150); // deja pasar el mousedown de abajo antes de esconder
      });

      dropdown.addEventListener('mousedown', (event) => {
        const option = event.target.closest('.song-picker-option');
        if (!option) return;
        event.preventDefault();
        chipsWrap.insertAdjacentHTML(
          'beforeend',
          `<span class="song-picker-chip" data-nombre="${escapeAttr(option.dataset.nombre)}">
            ${escapeHtml(option.dataset.nombre)}
            <button type="button" class="song-picker-chip-remove" title="Quitar">✕</button>
          </span>`
        );
        input.value = '';
        abrirDropdown('');
        guardar();
      });

      chipsWrap.addEventListener('click', (event) => {
        const removeBtn = event.target.closest('.song-picker-chip-remove');
        if (!removeBtn) return;
        removeBtn.closest('.song-picker-chip').remove();
        guardar();
      });
    });
  }

  // --- "Ver lecturas": consulta y muestra ACÁ MISMO, sin ir a otra
  // pantalla — es solo para consultar/preparar los cantos, no hace falta
  // pasar por toda la pantalla de Novedades para eso. Misma fuente que
  // "Consultar lecturas de una fecha" ahí (misadehoy.org: con semanas de
  // anticipación, mismo origen que la automática de todos los días — ver
  // esa pantalla si hace falta guardar esto de verdad).
  container.querySelectorAll('[data-ver-lecturas]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fecha = btn.dataset.verLecturas;
      const resultadoEl = container.querySelector(`#lecturas-resultado-${fecha}`);
      if (!resultadoEl.hidden) {
        resultadoEl.hidden = true;
        return;
      }
      resultadoEl.hidden = false;
      if (resultadoEl.dataset.cargado) return; // ya se buscó antes, no reconsultar

      resultadoEl.innerHTML = `<p class="chord-editor-hint">Buscando...</p>`;
      try {
        const res = await fetch(`${PUBLIC_URL}api/consultar-lecturas?fecha=${fecha}`);
        const data = await res.json();
        if (!data.ok) {
          resultadoEl.innerHTML = `<p class="chord-editor-hint">Todavía no está disponible para esta fecha — probá más cerca del día, o cargala a mano desde <a href="#/novedades?fecha=${fecha}">Novedades</a>.</p>`;
          return;
        }
        const items = [
          { titulo: '1ª Lectura', cuerpo: data.primeraLectura },
          { titulo: 'Salmo', cuerpo: data.salmo },
          { titulo: '2ª Lectura', cuerpo: data.segundaLectura },
          { titulo: 'Evangelio', cuerpo: data.evangelio },
          { titulo: 'Reflexión', cuerpo: data.reflexion },
        ].filter((item) => item.cuerpo);
        resultadoEl.innerHTML = `
          ${data.tituloDia ? `<p class="chord-editor-hint"><strong>${escapeHtml(data.tituloDia)}</strong></p>` : ''}
          <p class="chord-editor-hint">¿Vas a guardar esto de verdad? <a href="#/novedades?fecha=${fecha}">Hacelo desde Novedades →</a></p>
          ${items
            .map(
              (item) => `
            <div class="consulta-lectura-item">
              <strong>${escapeHtml(item.titulo)}</strong>
              <p class="consulta-lectura-texto">${escapeHtml(item.cuerpo)}</p>
            </div>`
            )
            .join('')}
        `;
        resultadoEl.dataset.cargado = '1';
      } catch {
        resultadoEl.innerHTML = `<p class="chord-editor-hint">No se pudo consultar (revisá la conexión).</p>`;
      }
    });
  });

  // Sincroniza en segundo plano al entrar — si trajo algo nuevo (otra
  // persona armó o cambió una asignación desde otro dispositivo), repinta
  // para que se note sin recargar la página.
  if (puedeEditar) {
    syncMisasNow().then((result) => {
      if (result.synced && result.pulled > 0) {
        renderCronogramaView(container);
      } else if (!result.synced && result.reason === 'error') {
        syncStatusEl.hidden = false;
        syncStatusEl.textContent = 'No se pudo sincronizar el cronograma (revisá la conexión).';
      }
    });
  }
}

function renderMiembrosSection(miembros, puedeEditar) {
  return `
    <div class="sidebar-group">
      <h3>Miembros del equipo</h3>
      <div class="song-picker-chips">
        ${miembros
          .map(
            (m) => `
          <span class="song-picker-chip">
            ${escapeHtml(m)}
            ${puedeEditar ? `<button type="button" class="song-picker-chip-remove" data-remove-miembro="${escapeAttr(m)}" title="Quitar">✕</button>` : ''}
          </span>`
          )
          .join('')}
        ${miembros.length === 0 ? `<p class="chord-editor-hint">Todavía no cargaste a nadie.</p>` : ''}
      </div>
      ${
        puedeEditar
          ? `<div class="form-actions">
              <input type="text" id="miembro-input" placeholder="Nombre..." autocomplete="off" />
              <button type="button" class="btn" id="miembro-add-btn">+ Agregar</button>
            </div>`
          : ''
      }
    </div>
  `;
}

function renderFinDeSemana(fin, miembros, misaPorClave, puedeEditar) {
  // El domingo, no el sábado: la vigilia del sábado a la noche toma las
  // MISMAS lecturas que el domingo (mismo día litúrgico), así que alcanza
  // con consultar una vez por finde, no una por horario.
  return `
    <div class="sidebar-group cronograma-finde">
      <div class="cronograma-finde-header">
        <h3>Fin de semana del ${formatFechaCorta(fin.sabado)} al ${formatFechaCorta(fin.domingo)}</h3>
        <button type="button" class="btn" data-ver-lecturas="${fin.domingo}">📖 Ver lecturas</button>
      </div>
      <div class="cronograma-lecturas-resultado" id="lecturas-resultado-${fin.domingo}" hidden></div>
      ${fin.slots.map((slot) => renderSlot(slot, miembros, misaPorClave, puedeEditar)).join('')}
    </div>
  `;
}

function renderSlot(slot, miembros, misaPorClave, puedeEditar) {
  const misa = misaPorClave.get(`${slot.fecha}|${slot.hora}`);
  const asignados = misa?.asignados || [];
  const cantidadCanciones = Object.values(misa?.items || {}).reduce((total, ids) => total + (Array.isArray(ids) ? ids.length : ids ? 1 : 0), 0);
  const listaHref = `#/misa/${slot.fecha}/${encodeURIComponent(slot.hora)}`;

  return `
    <div class="misa-category-row misa-category-row-multi cronograma-slot">
      <span class="misa-category-name">${escapeHtml(tituloMisa(slot.fecha, slot.hora))}</span>
      <div class="song-picker" data-slot-picker="${slot.fecha}|${slot.hora}">
        <div class="song-picker-chips">
          ${asignados
            .map(
              (nombre) => `
            <span class="song-picker-chip" data-nombre="${escapeAttr(nombre)}">
              ${escapeHtml(nombre)}
              ${puedeEditar ? `<button type="button" class="song-picker-chip-remove" title="Quitar">✕</button>` : ''}
            </span>`
            )
            .join('')}
        </div>
        ${
          puedeEditar
            ? `<input type="text" class="song-picker-input" placeholder="+ Agregar quién cubre..." autocomplete="off" ${
                miembros.length === 0 ? 'disabled' : ''
              } />
               <div class="song-picker-dropdown" hidden></div>`
            : asignados.length === 0
            ? `<p class="chord-editor-hint">— nadie asignado todavía —</p>`
            : ''
        }
      </div>
      <a class="btn cronograma-slot-btn" href="${listaHref}">
        🎵 Armar lista de canciones${cantidadCanciones ? ` (${cantidadCanciones})` : ''}
      </a>
      ${
        cantidadCanciones
          ? `<a class="btn cronograma-slot-btn" href="#/ensayar/${slot.fecha}/${encodeURIComponent(slot.hora)}">👁️ Ensayo</a>`
          : ''
      }
    </div>
  `;
}

function formatFechaCorta(fecha) {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
