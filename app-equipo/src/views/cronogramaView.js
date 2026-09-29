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
import { pushMiembro, pushMiembroDeletion, syncLabelsNow } from '../storage/labelsSync.js';
import { syncMisasNow } from '../storage/misasSync.js';
import { getSession } from '../storage/auth.js';
import { tituloMisa } from './misaListView.js';
import { PUBLIC_URL, APP_URL } from './qrView.js';

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
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="compartir-cronograma-btn">📤 Compartir por WhatsApp</button>
        <span class="qr-share-status" id="compartir-cronograma-status" hidden></span>
      </div>
      <textarea id="compartir-cronograma-textarea" class="share-fallback-textarea" rows="6" readonly hidden></textarea>
      ${renderFinDeSemana(finesConSlots[0], miembros, misaPorClave, puedeEditar)}
      ${
        finesConSlots.length > 1
          ? `<button type="button" class="btn" id="ver-mas-semanas-btn">Ver ${finesConSlots.length - 1} semana${
              finesConSlots.length - 1 === 1 ? '' : 's'
            } más →</button>
             <div id="cronograma-semanas-extra" hidden>
               ${finesConSlots
                 .slice(1)
                 .map((fin) => renderFinDeSemana(fin, miembros, misaPorClave, puedeEditar))
                 .join('')}
             </div>`
          : ''
      }
    </div>
  `;

  const syncStatusEl = container.querySelector('#cronograma-sync-status');

  // Por defecto se muestra solo el próximo fin de semana (lo urgente) — el
  // resto queda a un toque de distancia, sin obligar a scrollear un
  // montón para llegar a lo importante. Ya está todo renderizado (no hace
  // falta pedir nada de nuevo), solo se destapa.
  container.querySelector('#ver-mas-semanas-btn')?.addEventListener('click', (event) => {
    container.querySelector('#cronograma-semanas-extra').hidden = false;
    event.target.remove();
  });

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
        dropdown.innerHTML =
          disponibles.map((m) => `<button type="button" class="song-picker-option" data-nombre="${escapeAttr(m)}">${escapeHtml(m)}</button>`).join('') ||
          `<p class="song-picker-empty">${
            miembros.length === 0 ? 'Todavía no cargaste a nadie — agregalo arriba, en "Miembros del equipo".' : 'No queda nadie más para agregar acá.'
          }</p>`;
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

  // --- Compartir por WhatsApp: arma una PLACA (imagen) con el cronograma
  // y abre el selector nativo del celular — una imagen se distingue mejor
  // en el chat que un mensaje de texto largo, que puede quedar perdido
  // entre otros mensajes. Si el navegador no puede compartir imágenes
  // (navigator.canShare con archivos), se cae al texto de siempre; mismo
  // mecanismo ya probado que "Compartir invitación con el Evangelio"
  // (Novedades) y el botón del QR para el resto de los respaldos:
  // navigator.share primero, si no existe o falla copia al portapapeles, y
  // si tampoco se puede deja el texto seleccionable para copiar a mano.
  // Nunca se manda solo: siempre es la persona la que elige a quién y toca
  // "Enviar" en su propio WhatsApp.
  container.querySelector('#compartir-cronograma-btn')?.addEventListener('click', async () => {
    const statusEl = container.querySelector('#compartir-cronograma-status');
    const textareaEl = container.querySelector('#compartir-cronograma-textarea');
    statusEl.hidden = true;
    textareaEl.hidden = true;

    // Referencia del día litúrgico por finde (da contexto sin mandar las
    // lecturas enteras, que harían el mensaje kilométrico) — se pide
    // fresca cada vez, no depende de que alguien ya haya tocado "Ver
    // lecturas" para ese finde en particular.
    const tituloPorFinde = await Promise.all(
      finesConSlots.map(async (fin) => {
        try {
          const res = await fetch(`${PUBLIC_URL}api/consultar-lecturas?fecha=${fin.domingo}`);
          const data = await res.json();
          return data.ok ? data.tituloDia : null;
        } catch {
          return null;
        }
      })
    );

    const spaceLabel = getSpaceLabel(space);
    // ?space=... para que quien abra el link desde OTRO dispositivo (o sin
    // esta parroquia ya seleccionada) caiga directo en la correcta, sin
    // tener que elegirla — ver el ?space= que lee main.js al arrancar.
    const appUrl = `${APP_URL}?space=${encodeURIComponent(space)}#/cronograma`;
    const esNavegadorEmbebido = /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);

    if (!esNavegadorEmbebido && navigator.share && navigator.canShare) {
      try {
        const blob = await armarPlacaCronograma(finesConSlots, misaPorClave, tituloPorFinde, spaceLabel);
        const file = new File([blob], 'cronograma.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `👉 Ingresá a la app para armar tu misa:\n${appUrl}`, title: 'Cronograma' });
          return;
        }
      } catch {
        // Canceló, no se pudo armar la imagen, o no se pudo compartir así:
        // seguimos abajo al respaldo de texto de siempre.
      }
    }

    const texto = armarTextoCronograma(finesConSlots, misaPorClave, tituloPorFinde, spaceLabel, appUrl);

    if (!esNavegadorEmbebido && navigator.share) {
      try {
        await navigator.share({ title: 'Cronograma', text: texto });
        return;
      } catch {
        // Canceló, o falló: seguimos abajo al respaldo.
      }
    }
    if (!esNavegadorEmbebido) {
      try {
        await navigator.clipboard.writeText(texto);
        statusEl.hidden = false;
        statusEl.textContent = '✓ Texto copiado, pegalo donde quieras compartirlo.';
        return;
      } catch {
        // Tampoco se pudo: seguimos al respaldo final.
      }
    }
    textareaEl.value = texto;
    textareaEl.hidden = false;
    textareaEl.select();
    statusEl.hidden = false;
    statusEl.textContent = esNavegadorEmbebido
      ? 'Este navegador (el de Facebook/Instagram) no deja compartir directo. Mantené presionado el texto de abajo y elegí "Copiar".'
      : 'No se pudo copiar solo. Mantené presionado el texto de abajo y elegí "Copiar".';
  });

  // Sincroniza en segundo plano al entrar — si trajo algo nuevo (otra
  // persona armó o cambió una asignación, o cargó un miembro nuevo desde
  // otro dispositivo), repinta para que se note sin recargar la página.
  // Los miembros del equipo viajan por syncLabelsNow() (junto con carpetas
  // y tiempos/temas litúrgicos, ver storage/labelsSync.js) — sin esto acá,
  // un miembro agregado desde el celular nunca aparecía solo en la tablet
  // hasta entrar a Inicio (la única pantalla que lo sincronizaba).
  if (puedeEditar) {
    Promise.all([syncMisasNow(), syncLabelsNow()]).then(([misasResult, labelsResult]) => {
      if ((misasResult.synced && misasResult.pulled > 0) || labelsResult.changed) {
        renderCronogramaView(container);
      } else if (!misasResult.synced && misasResult.reason === 'error') {
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
  //
  // Si NINGÚN horario de este finde tiene a nadie asignado todavía, se
  // resalta entero (mismo criterio que el naranja de la planilla que
  // usaban antes) — para verlo de un vistazo, sin tener que leer los 3
  // horarios uno por uno para darse cuenta de que falta cubrir.
  const sinCubrir = fin.slots.every((slot) => !(misaPorClave.get(`${slot.fecha}|${slot.hora}`)?.asignados?.length));
  return `
    <div class="sidebar-group cronograma-finde${sinCubrir ? ' cronograma-finde-sin-cubrir' : ''}">
      <div class="cronograma-finde-header">
        <h3>
          ${sinCubrir ? '<span title="Nadie asignado todavía">⚠️</span> ' : ''}
          Fin de semana del ${formatFechaCorta(fin.sabado)} al ${formatFechaCorta(fin.domingo)}
        </h3>
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

// Arma el mensaje para WhatsApp: un bloque por fin de semana, con la
// referencia del día litúrgico si se pudo traer, y una línea por horario
// con quién cubre (o "sin asignar" bien visible, para que se note lo que
// todavía falta cubrir en vez de quedar en blanco sin explicación).
function armarTextoCronograma(finesConSlots, misaPorClave, tituloPorFinde, spaceLabel, appUrl) {
  const bloques = finesConSlots.map((fin, i) => {
    const titulo = tituloPorFinde[i];
    const encabezado = `*📖 Fin de semana del ${formatFechaCorta(fin.sabado)} al ${formatFechaCorta(fin.domingo)}*${
      titulo ? ` — ${titulo}` : ''
    }`;
    const filas = fin.slots.map((slot) => {
      const misa = misaPorClave.get(`${slot.fecha}|${slot.hora}`);
      const asignados = misa?.asignados?.length ? misa.asignados.join(', ') : '— sin asignar —';
      return `🎵 ${slot.diaLabel} ${slot.hora} hs: ${asignados}`;
    });
    return [encabezado, ...filas].join('\n');
  });
  return `📅 *Cronograma — ${spaceLabel}*\n\n${bloques.join('\n\n')}\n\n👉 Ingresá a la app para armar tu misa:\n${appUrl}`;
}

// --- Placa (imagen) del cronograma, armada con <canvas> al vuelo — se ve
// mejor y no se pierde en el chat como un mensaje de texto largo. Se mide
// el contenido primero (una lista larga de nombres se envuelve en más de
// una línea) para crear el canvas del alto justo, sin dejar un pedazo de
// fondo vacío ni cortar contenido abajo. Mismos colores que la marca
// (--bg/--accent de siempre, ver styles.css :root) para que se sienta
// parte de la misma app aunque sea una imagen suelta.
const PLACA_ANCHO = 1080;
const PLACA_MARGEN_X = 64;
const PLACA_COLOR_FONDO = '#0f2220';
const PLACA_COLOR_ACENTO = '#7fd8c4';
const PLACA_COLOR_TEXTO = '#ffffff';
const PLACA_COLOR_TEXTO_TENUE = '#9fbdb6';
const PLACA_COLOR_BOTON = '#2f8a7a';

function wrapCanvasText(ctx, texto, anchoMaximo) {
  const palabras = texto.split(' ');
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > anchoMaximo) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function armarPlacaCronograma(finesConSlots, misaPorClave, tituloPorFinde, spaceLabel) {
  const anchoContenido = PLACA_ANCHO - PLACA_MARGEN_X * 2;
  // Canvas "de mentira" (nunca se dibuja ni se agrega a la página) solo
  // para medir cuánto ocupa el texto con cada fuente, antes de saber el
  // alto final.
  const medidor = document.createElement('canvas').getContext('2d');

  const lineas = [];
  function agregarTexto(texto, font, color, lineHeight) {
    medidor.font = font;
    for (const l of wrapCanvasText(medidor, texto, anchoContenido)) {
      lineas.push({ texto: l, font, color, lineHeight });
    }
  }
  function agregarEspacio(alto) {
    lineas.push({ espacio: alto });
  }

  agregarTexto('📅 Cronograma', '600 40px sans-serif', PLACA_COLOR_ACENTO, 50);
  agregarTexto(spaceLabel, '500 28px sans-serif', PLACA_COLOR_TEXTO, 40);
  agregarEspacio(30);

  finesConSlots.forEach((fin, i) => {
    agregarTexto(`Fin de semana del ${formatFechaCorta(fin.sabado)} al ${formatFechaCorta(fin.domingo)}`, '600 30px sans-serif', PLACA_COLOR_ACENTO, 38);
    if (tituloPorFinde[i]) {
      agregarTexto(tituloPorFinde[i], '400 22px sans-serif', PLACA_COLOR_TEXTO_TENUE, 32);
    }
    agregarEspacio(10);
    fin.slots.forEach((slot) => {
      const misa = misaPorClave.get(`${slot.fecha}|${slot.hora}`);
      const asignados = misa?.asignados?.length ? misa.asignados.join(', ') : 'sin asignar';
      agregarTexto(`🎵 ${slot.diaLabel} ${slot.hora} hs: ${asignados}`, '400 26px sans-serif', PLACA_COLOR_TEXTO, 36);
    });
    agregarEspacio(34);
  });

  const margenSuperior = 70;
  const altoBoton = 150; // incluye el espacio arriba del botón
  let alto = margenSuperior;
  for (const item of lineas) alto += item.espacio ?? item.lineHeight;
  alto += altoBoton;

  const canvas = document.createElement('canvas');
  canvas.width = PLACA_ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PLACA_COLOR_FONDO;
  ctx.fillRect(0, 0, PLACA_ANCHO, alto);

  let y = margenSuperior;
  for (const item of lineas) {
    if (item.espacio) {
      y += item.espacio;
      continue;
    }
    y += item.lineHeight;
    ctx.font = item.font;
    ctx.fillStyle = item.color;
    ctx.fillText(item.texto, PLACA_MARGEN_X, y);
  }

  const botonAlto = 84;
  const botonY = alto - botonAlto - 40;
  ctx.fillStyle = PLACA_COLOR_BOTON;
  roundRect(ctx, PLACA_MARGEN_X, botonY, anchoContenido, botonAlto, 16);
  ctx.fill();
  ctx.fillStyle = PLACA_COLOR_TEXTO;
  ctx.font = '600 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👉 Ingresá a la app para armar tu misa', PLACA_ANCHO / 2, botonY + 54);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
  });
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
