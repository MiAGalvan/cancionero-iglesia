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
import { PUBLIC_URL } from './qrView.js';

// Estos 4 títulos son los que reconoce la página pública para mostrarlos
// siempre en el orden de la misa en "Lecturas" (ver pagina-publica/app.js)
// — los botones de acá evitan que alguien los tipee mal a mano.
// "Reflexión" no forma parte de la misa (no tiene lugar en el orden
// litúrgico como las otras 4), así que la página pública la trata aparte:
// no aparece en la pantalla de Lecturas, se usa solo en la guía de
// Adoración (ver renderAdoracion en pagina-publica/app.js).
const LECTURAS_TITULOS = ['1ª Lectura', 'Salmo', '2ª Lectura', 'Evangelio', 'Reflexión'];

// Mismo criterio flexible que usa la página pública para reconocer una
// lectura (ver ordenLectura en pagina-publica/app.js): alcanza con que el
// título EMPIECE con el nombre de la lectura, así una referencia bíblica
// pegada después (ej. "Evangelio (Mt 20,1-16)", común en avisos cargados
// a mano antes de que existieran estos botones) sigue reconociéndose. Sin
// esto, esos avisos viejos nunca ofrecían el campo de fecha al editarlos
// (por no coincidir char a char), así que su fecha quedaba siempre vacía.
const COMBINING_MARKS_NOVEDADES = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

function normalizarTitulo(texto) {
  return (texto || '').normalize('NFD').replace(COMBINING_MARKS_NOVEDADES, '').trim().toUpperCase();
}

function tituloCoincideConLectura(tituloGuardado, tituloBoton) {
  return normalizarTitulo(tituloGuardado).startsWith(normalizarTitulo(tituloBoton));
}

function esTituloDeLectura(titulo) {
  return LECTURAS_TITULOS.some((t) => tituloCoincideConLectura(titulo, t));
}

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
        <p id="proxima-misa-estado-hint" class="chord-editor-hint" ${(espacio?.horarioMisas || []).length === 0 ? 'hidden' : ''}>
          ✓ Ya no hace falta escribir esto: como hay un horario semanal cargado más abajo, la página pública calcula sola la fecha correcta cada día y este texto no se muestra.
        </p>
        <label>
          Próxima misa (día y hora, tal cual la querés ver — solo se usa si no hay ningún horario semanal cargado abajo)
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
        <span class="categories-label">🗓️ Horario semanal (opcional, se repite todas las semanas — si cargás esto, la página pública calcula sola la próxima misa y ya no usa el texto de arriba). "Hasta" es opcional: si lo cargás, en cuanto termine pasa a mostrar la próxima misa en vez de seguir en vivo</span>
        <div id="horario-rows"></div>
        <div class="form-actions">
          <button type="button" class="btn" id="add-horario-row-btn" ${loggedIn ? '' : 'disabled'}>+ Agregar horario</button>
          <button type="button" class="btn btn-accent" id="save-horario-btn" ${loggedIn ? '' : 'disabled'}>Guardar</button>
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
        <p class="chord-editor-hint">
          Se cargan solas todos los días de madrugada (1ª Lectura, Salmo, 2ª Lectura, Evangelio y Reflexión, según corresponda) — no hace falta tocar nada acá salvo que quieras corregir algo o adelantar la de una misa programada. Si corregís una de hoy a mano, la automática no la vuelve a pisar.
        </p>
        <p id="auto-lecturas-status" class="chord-editor-hint" hidden></p>
        <div class="form-actions">
          ${LECTURAS_TITULOS.map(
            (titulo) => `<button type="button" class="btn" data-lectura="${escapeAttr(titulo)}" ${loggedIn ? '' : 'disabled'}>${escapeHtml(titulo)}</button>`
          ).join('')}
        </div>
        <p class="chord-editor-hint">
          "Cantar y tocar es rezar" — invitá a la gente a leer el Evangelio antes de venir a cantar.
        </p>
        <div class="form-actions">
          <button type="button" class="btn btn-accent" id="share-evangelio-btn">📤 Compartir invitación con el Evangelio de hoy</button>
          <span class="qr-share-status" id="share-evangelio-status" hidden></span>
        </div>
        <textarea id="share-evangelio-textarea" class="share-fallback-textarea" rows="4" readonly hidden></textarea>
      </div>

      <div class="categories-field">
        <span class="categories-label">🔍 Consultar lecturas de una fecha (para preparar los cantos con anticipación)</span>
        <p class="chord-editor-hint">
          Busca en otra fuente (Vatican News) que publica con más anticipación que la automática de arriba —
          a cambio no trae el Salmo, y no siempre trae una reflexión. Solo te muestra el resultado: no guarda
          ni publica nada hasta que vos elijas "Usar esta".
        </p>
        <div class="misa-category-row">
          <input type="date" id="consultar-fecha-input" value="${mananaIso()}" ${loggedIn ? '' : 'disabled'} />
          <button type="button" class="btn" id="consultar-fecha-btn" ${loggedIn ? '' : 'disabled'}>Buscar</button>
        </div>
        <div id="consultar-fecha-resultado"></div>
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

  // Una hora después del inicio, como valor de arranque razonable al
  // agregar un horario nuevo — se puede cambiar a mano si la misa dura
  // más o menos.
  function sumarUnaHora(hora) {
    const [hh, mm] = hora.split(':').map(Number);
    const total = (hh * 60 + mm + 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function horarioRowHtml(row, i) {
    return `
      <div class="misa-category-row horario-row-doble" data-idx="${i}">
        <select class="horario-dia-select" data-idx="${i}" ${loggedIn ? '' : 'disabled'}>
          ${DIAS_SEMANA.map((d, di) => `<option value="${di}" ${row.dia === di ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
        <input type="time" class="horario-hora-input" data-idx="${i}" value="${escapeAttr(row.hora || '11:00')}" ${loggedIn ? '' : 'disabled'} />
        <span class="horario-hasta">hasta</span>
        <input type="time" class="horario-horafin-input" data-idx="${i}" value="${escapeAttr(row.horaFin || '')}" ${loggedIn ? '' : 'disabled'} />
        <button type="button" class="btn btn-danger btn-icon" data-del-horario="${i}" ${loggedIn ? '' : 'disabled'}>✕</button>
      </div>
    `;
  }

  function renderHorarioRows() {
    horarioRowsEl.innerHTML =
      horarioMisas.length === 0
        ? `<p class="song-artist">Sin horario semanal cargado — se usa el texto de "Próxima misa" de arriba.</p>`
        : horarioMisas.map(horarioRowHtml).join('');
    const hintEl = container.querySelector('#proxima-misa-estado-hint');
    if (hintEl) hintEl.hidden = horarioMisas.length === 0;
  }

  // Los <select>/<input> de cada fila se editan directo en el DOM (no en el
  // array) — esto vuelca esos cambios al array antes de agregar/borrar una
  // fila o guardar, para no perderlos.
  function sincronizarHorarioDesdeDom() {
    horarioRowsEl.querySelectorAll('.misa-category-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.idx);
      const dia = Number(rowEl.querySelector('.horario-dia-select').value);
      const hora = rowEl.querySelector('.horario-hora-input').value || '11:00';
      const horaFin = rowEl.querySelector('.horario-horafin-input').value || null;
      horarioMisas[idx] = { dia, hora, horaFin };
    });
  }

  renderHorarioRows();

  container.querySelector('#add-horario-row-btn').addEventListener('click', () => {
    sincronizarHorarioDesdeDom();
    horarioMisas.push({ dia: 0, hora: '11:00', horaFin: sumarUnaHora('11:00') });
    renderHorarioRows();
  });

  horarioRowsEl.addEventListener('click', (event) => {
    const idx = event.target.dataset.delHorario;
    if (idx === undefined) return;
    sincronizarHorarioDesdeDom();
    horarioMisas.splice(Number(idx), 1);
    renderHorarioRows();
  });

  // Un solo guardado, con dos botones que lo disparan (uno pegado al
  // horario, otro pegado a redes) — antes había un único botón bien lejos
  // del horario (al fondo, junto a redes sociales), fácil de no ver
  // después de cargar los horarios y creer que ya había quedado guardado.
  function guardarDatosPublicos() {
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
  }

  container.querySelector('#save-horario-btn')?.addEventListener('click', guardarDatosPublicos);
  container.querySelector('#save-mass-btn')?.addEventListener('click', guardarDatosPublicos);

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
      const existing = cachedAnuncios.find((a) => tituloCoincideConLectura(a.titulo, titulo));
      // Si ya había una cargada (aunque con un título viejo, ej. con la
      // referencia bíblica pegada), se reutiliza tal cual el título que ya
      // tenía en vez de pisarlo con el genérico del botón — así no se
      // pierde ese texto ya cargado.
      openForm({
        id: existing?.id,
        titulo: existing?.titulo || titulo,
        cuerpo: existing?.cuerpo || '',
        fecha: existing?.fecha || hoyIso(),
      });
    });
  });

  // Consulta a demanda (no publica nada sola) a una fuente distinta de la
  // automática de arriba — Vatican News publica con más anticipación, útil
  // para preparar cantos de una misa de dentro de varios días. Ver
  // pagina-publica/api/consultar-lecturas.js.
  const resultadoConsultaEl = container.querySelector('#consultar-fecha-resultado');
  container.querySelector('#consultar-fecha-btn')?.addEventListener('click', async () => {
    const fecha = container.querySelector('#consultar-fecha-input').value;
    if (!fecha) return;
    resultadoConsultaEl.innerHTML = `<p class="chord-editor-hint">Buscando...</p>`;
    try {
      const res = await fetch(`${PUBLIC_URL}api/consultar-lecturas?fecha=${fecha}`);
      const data = await res.json();
      if (!data.ok) {
        resultadoConsultaEl.innerHTML = `<p class="chord-editor-hint">Todavía no está disponible para esa fecha — probá más cerca del día, o cargala a mano con los botones de arriba.</p>`;
        return;
      }
      const items = [
        { titulo: '1ª Lectura', cuerpo: data.primeraLectura },
        { titulo: '2ª Lectura', cuerpo: data.segundaLectura },
        { titulo: 'Evangelio', cuerpo: data.evangelio },
        { titulo: 'Reflexión', cuerpo: data.reflexion },
      ].filter((item) => item.cuerpo);

      resultadoConsultaEl.innerHTML = `
        ${data.tituloDia ? `<p class="chord-editor-hint"><strong>${escapeHtml(data.tituloDia)}</strong></p>` : ''}
        <ul class="song-list">
          ${items
            .map(
              (item, i) => `
            <li class="song-item">
              <span>
                <strong>${escapeHtml(item.titulo)}</strong>
                <span class="song-artist">${escapeHtml(item.cuerpo.slice(0, 140))}${item.cuerpo.length > 140 ? '…' : ''}</span>
              </span>
              <button type="button" class="btn btn-accent" data-usar-consulta="${i}">Usar esta</button>
            </li>`
            )
            .join('')}
        </ul>
      `;

      resultadoConsultaEl.querySelectorAll('[data-usar-consulta]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items[Number(btn.dataset.usarConsulta)];
          const existing = cachedAnuncios.find((a) => tituloCoincideConLectura(a.titulo, item.titulo) && a.fecha === fecha);
          openForm({
            id: existing?.id,
            titulo: existing?.titulo || item.titulo,
            cuerpo: item.cuerpo,
            fecha,
          });
        });
      });
    } catch {
      resultadoConsultaEl.innerHTML = `<p class="chord-editor-hint">No se pudo consultar (revisá la conexión).</p>`;
    }
  });

  // Arma una invitación (no solo un aviso) a partir del Evangelio ya
  // cargado: la idea es que quien va a cantar lo lea antes de venir a
  // misa, no solo enterarse de que existe. Usa el mismo mecanismo que el
  // botón "Compartir" del QR (navigator.share con fallback a copiar al
  // portapapeles), así abre el menú nativo de WhatsApp/Instagram/etc. en
  // vez de intentar postear directo a cada red (eso exigiría credenciales
  // propias por plataforma, mucho más pesado para lo que hace falta acá).
  container.querySelector('#share-evangelio-btn')?.addEventListener('click', async () => {
    const shareStatusEl = container.querySelector('#share-evangelio-status');
    const evangelio = cachedAnuncios.find((a) => tituloCoincideConLectura(a.titulo, 'Evangelio'));
    if (!evangelio?.cuerpo) {
      shareStatusEl.hidden = false;
      shareStatusEl.textContent = 'Todavía no hay Evangelio cargado para compartir.';
      return;
    }
    const referencia = evangelio.cuerpo.split('\n')[0].trim();
    // #/lecturas al final, no la raíz: la raíz abre la lista de canciones,
    // y la invitación es a LEER el Evangelio, no a ver el cancionero.
    const url = `${PUBLIC_URL}?space=${encodeURIComponent(space)}#/lecturas`;
    const texto = `🎶 Antes de cantar, recemos.\n\nLeé el Evangelio de hoy${
      referencia ? ` (${referencia})` : ''
    } para llegar a la misa con el corazón afinado — cantar también es orar.\n\n${url}`;
    const textareaEl = container.querySelector('#share-evangelio-textarea');

    // El navegador "embebido" que abre Facebook/Instagram al tocar un link
    // DENTRO de esas apps (no el navegador normal del celular) suele tener
    // roto tanto navigator.share como el portapapeles por JS, sin tirar
    // ningún error — el botón queda sin hacer nada, en silencio. Ahí vamos
    // directo al texto seleccionable de abajo, que no depende de ninguna
    // API rota: mantener presionado y "Copiar" siempre funciona.
    const esNavegadorEmbebido = /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);

    if (!esNavegadorEmbebido && navigator.share) {
      try {
        await navigator.share({ title: 'Evangelio de hoy', text: texto });
        return;
      } catch {
        // Canceló, o falló: seguimos abajo al respaldo.
      }
    }
    if (!esNavegadorEmbebido) {
      try {
        await navigator.clipboard.writeText(texto);
        shareStatusEl.hidden = false;
        shareStatusEl.textContent = '✓ Texto copiado, pegalo donde quieras compartirlo.';
        return;
      } catch {
        // Tampoco se pudo: seguimos al respaldo final.
      }
    }
    textareaEl.value = texto;
    textareaEl.hidden = false;
    textareaEl.select();
    shareStatusEl.hidden = false;
    shareStatusEl.textContent = esNavegadorEmbebido
      ? 'Este navegador (el de Facebook/Instagram) no deja compartir directo. Mantené presionado el texto de abajo y elegí "Copiar".'
      : 'No se pudo copiar solo. Mantené presionado el texto de abajo y elegí "Copiar".';
  });

  function showError(err) {
    statusEl.textContent =
      err?.code === '42501'
        ? 'Tu usuario no tiene permiso para editar novedades de esta parroquia.'
        : `No se pudo guardar: ${err?.message || err}`;
    statusEl.hidden = false;
  }

  async function load() {
    // "*" en vez de nombrar cada columna: si el proyecto todavía no corrió
    // la migración de auto_generated, esa columna simplemente no viene en
    // la fila (undefined, se trata como falsy) en vez de tirar abajo toda
    // la consulta — ya pasó antes con otra columna nueva (ver
    // pagina-publica/app.js).
    const { data, error } = await supabase
      .from('anuncios')
      .select('*')
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
          }${novedad.auto_generated ? ` <span class="category-tag" title="Cargada sola por el trabajo automático">🤖</span>` : ''}
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
    // El campo de fecha solo aparece para las 4 lecturas: un aviso común
    // (ej. "Tallarineada") no necesita una fecha propia, la fecha ya suele
    // ir en el texto. Para una lectura, en cambio, es lo que permite
    // distinguir si es la de hoy o la de una misa programada (ej. el
    // domingo próximo) cargada con anticipación.
    const esLectura = esTituloDeLectura(existing?.titulo);
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

      // auto_generated: false porque esto lo está guardando una persona a
      // mano — así, si es una lectura, el trabajo automático de la
      // madrugada (ver pagina-publica/api/sync-lecturas.js) no la vuelve a
      // pisar mientras sea la fecha de hoy.
      const payload = { space, titulo, cuerpo, updated_at: new Date().toISOString(), auto_generated: false };
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

  // Muestra si el trabajo automático de lecturas (ver
  // pagina-publica/api/sync-lecturas.js) viene corriendo bien, para que se
  // note si se rompió en silencio alguna madrugada en vez de darse cuenta
  // recién cuando alguien pregunta por qué no está el Evangelio de hoy.
  const autoStatusEl = container.querySelector('#auto-lecturas-status');
  const { data: estados } = await supabase
    .from('cron_status')
    .select('last_run_at, last_success, last_error')
    .eq('job', 'sync-lecturas')
    .maybeSingle();
  if (estados && autoStatusEl) {
    const cuando = new Date(estados.last_run_at).toLocaleString('es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    autoStatusEl.hidden = false;
    autoStatusEl.textContent = estados.last_success
      ? `✓ Última publicación automática: ${cuando}.`
      : `⚠️ La publicación automática falló el ${cuando}${estados.last_error ? ` (${estados.last_error})` : ''}. Podés cargar las lecturas a mano mientras tanto.`;
  }
}

// Fecha local (no UTC) en formato YYYY-MM-DD, para que coincida con lo que
// espera un <input type="date"> y con cómo la página pública compara "hoy".
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mananaIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
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
