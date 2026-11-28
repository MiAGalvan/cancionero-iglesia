// Vista de una canción: letra + acordes, transposición, autoscroll y
// diagramas de acordes al tocar uno. Los controles viven en un panel lateral
// (se puede ocultar del todo) para que la letra tenga el máximo de espacio.
import { getSong, deleteSong } from '../storage/db.js';
import { getPublicSongByUuid } from '../storage/publicCancionero.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { createAutoScroller } from '../scroll/autoScroll.js';
import { attachPinchZoom } from '../gestures/pinchZoom.js';
import { getGuitarVoicings, drawGuitarVoicing } from '../diagrams/guitarDiagram.js';
import { renderPianoDiagram } from '../diagrams/pianoDiagram.js';
import {
  getShowChords,
  setShowChords,
  getChordNotation,
  setChordNotation,
  getDeviceGroup,
  getCurrentSpaceKey,
  getSpaceFullLabel,
  getModoLectura,
  getAjustarPantalla,
  setAjustarPantalla,
  getMostrarDiagramas,
  setMostrarDiagramas,
  getInstrument,
  setInstrument,
} from '../storage/settings.js';
import { getSession } from '../storage/auth.js';
import { createAudioRecorder } from '../recorder/audioRecorder.js';
import { uploadSongRecording } from '../storage/recordings.js';
import { isSupabaseConfigured } from '../storage/supabaseClient.js';
import { updatePublishedSong } from '../liturgia/publicar.js';

export async function renderSongView(container, { id, returnTo }) {
  const modoLectura = getModoLectura();
  // Sin sesión, no se puede editar/borrar ni siquiera local — ver el mismo
  // criterio en newSongView.js/libraryView.js/misaListView.js. El modo
  // lectura es una restricción EXTRA para cuando sí hay sesión.
  const puedeEditar = Boolean(await getSession()) && !modoLectura;
  // Primero se busca local (dispositivo del equipo, ya sincronizado). Si no
  // aparece ahí, puede ser un link a una canción del cancionero público
  // (ver publicCancionero.js — sin sesión, libraryView.js linkea con el
  // uuid de Supabase en vez del id numérico local): se prueba de nuevo por
  // ese lado antes de dar por perdida la canción.
  // OJO: Number(id) da NaN para un uuid (ej. "a1b2c3...") — pedirle a
  // IndexedDB una key NaN no devuelve "no encontrado", tira una excepción
  // (DataError). Por eso el chequeo de Number.isFinite antes de ir a lo
  // local: sin él, cualquier canción pública rompía la pantalla entera en
  // vez de mostrarla.
  const numericId = Number(id);
  let song = Number.isFinite(numericId) ? await getSong(numericId) : null;
  if (!song) {
    const publicSong = await getPublicSongByUuid(id);
    if (publicSong) song = { ...publicSong, id: publicSong.uuid };
  }
  const backHref = returnTo || '#/library';
  const backLabel = returnTo ? '← Volver' : '← Biblioteca';
  if (!song) {
    container.innerHTML = `<div class="empty-state">No se encontró la canción. <a href="${backHref}">Volver</a></div>`;
    return;
  }

  const returnToQuery = returnTo ? `?returnTo=${encodeURIComponent(returnTo.replace(/^#/, ''))}` : '';
  // Se llegó desde "Ver publicada" (el link 🎸 de una canción que YA está
  // publicada hoy): solo ahí tiene sentido ofrecer el atajo de actualizar
  // esa corrección puntual en lo que está viendo la gente ahora mismo.
  const fromListaPublicada = returnTo === '#/lista-publicada';

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="${backHref}">${backLabel}</a>
      <h2>${escapeHtml(song.title)}</h2>
      <div class="form-actions">
        ${
          fromListaPublicada && puedeEditar
            ? `<button class="btn" id="update-published-btn">🔄 Actualizar en la lista publicada</button>`
            : ''
        }
        <button class="btn btn-icon" id="fullscreen-toggle" title="Pantalla completa">⛶</button>
        ${
          !puedeEditar
            ? ''
            : `<a class="btn" href="#/song/${song.id}/edit${returnToQuery}">Editar</a>
               <button class="btn btn-danger" id="delete-btn">Eliminar</button>`
        }
      </div>
    </div>
    <div class="song-layout" id="song-layout">
      <aside class="chord-strip" id="chord-strip" aria-label="Diagramas de los acordes" hidden></aside>
      <div class="lyrics-container" id="lyrics-container"></div>
      <span class="floating-speed-hint" id="floating-speed-hint" hidden></span>
      <p class="dock-note" id="fit-status" hidden></p>
      <div class="song-dock" id="song-dock">
        <button type="button" class="dock-btn" id="fit-btn" aria-pressed="false" aria-label="Ajustar a la pantalla" title="Ajustar a la pantalla">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
          <span>Ajustar</span>
        </button>
        <button type="button" class="dock-btn dock-text" id="fontsize-up" aria-label="Letra más grande" title="Letra más grande">A+</button>
        <button type="button" class="dock-btn dock-text" id="fontsize-down" aria-label="Letra más chica" title="Letra más chica">A−</button>
        <div class="dock-tone">
          <button type="button" class="dock-btn" id="tone-btn" aria-label="Cambiar el tono" title="Cambiar el tono">
            <b class="dock-badge" id="tone-badge">0</b>
            <span>Tono</span>
          </button>
          <div class="tone-chip" id="tone-chip" hidden>
            <button type="button" class="btn btn-icon" id="transpose-down" aria-label="Bajar un semitono">−</button>
            <span class="transpose-value" id="transpose-value">0</span>
            <button type="button" class="btn btn-icon" id="transpose-up" aria-label="Subir un semitono">+</button>
          </div>
        </div>
        <button
          type="button"
          class="dock-btn dock-play"
          id="floating-scroll-toggle"
          title="Tocar: play/pausa. Arrastrar arriba/abajo: velocidad"
        >▶</button>
        <button type="button" class="dock-btn" id="more-btn" aria-label="Más opciones" title="Más opciones">
          <span class="dock-dots" aria-hidden="true">⋯</span>
          <span>Más</span>
        </button>
      </div>
      <div class="song-sheet-backdrop" id="sheet-backdrop" hidden></div>
      <div class="song-sheet" id="song-sheet" role="dialog" aria-label="Más opciones" hidden>
        <div class="song-sheet-grab"></div>
        <div class="song-sheet-header">
          <h3>Más opciones</h3>
          <button type="button" class="btn btn-icon" id="sheet-close" aria-label="Cerrar">✕</button>
        </div>
        <div class="song-sheet-body">
          <label class="sheet-row">
            <span>Mostrar acordes</span>
            <input type="checkbox" id="show-chords-input" ${getShowChords() ? 'checked' : ''} />
          </label>
          <label class="sheet-row">
            <span>Cifrado europeo (Do, Re, Mi...)</span>
            <input type="checkbox" id="chord-notation-input" ${getChordNotation() === 'solfege' ? 'checked' : ''} />
          </label>
          <label class="sheet-row">
            <span>Diagramas de acordes al costado</span>
            <input type="checkbox" id="show-diagrams-input" ${getMostrarDiagramas() ? 'checked' : ''} />
          </label>
          <div class="sheet-row">
            <span>Instrumento</span>
            <div class="instrument-controls">
              <label><input type="radio" name="instrument" value="guitar" ${getInstrument() === 'guitar' ? 'checked' : ''} /> Guitarra</label>
              <label><input type="radio" name="instrument" value="piano" ${getInstrument() === 'piano' ? 'checked' : ''} /> Piano</label>
            </div>
          </div>
          <div class="sheet-row">
            <span>Interlineado</span>
            <div class="fontsize-controls">
              <button type="button" class="btn btn-icon" id="lineheight-down">≡−</button>
              <button type="button" class="btn btn-icon" id="lineheight-up">≡+</button>
            </div>
          </div>
          <div class="sheet-row">
            <span>Scroll automático</span>
            <div class="scroll-buttons">
              <button type="button" class="btn btn-icon btn-scroll-toggle" id="scroll-toggle">▶</button>
              <button type="button" class="btn" id="scroll-reset">Inicio</button>
            </div>
          </div>
          <div class="sheet-row">
            <span>Velocidad del scroll</span>
            <div class="scroll-speed-row fontsize-controls">
              <button type="button" class="btn btn-icon" id="speed-down">−</button>
              <span class="speed-value" id="speed-value">15</span>
              <button type="button" class="btn btn-icon" id="speed-up">+</button>
            </div>
          </div>
          ${
            !puedeEditar
              ? ''
              : `<div class="sheet-row sheet-row-block">
                  <span>Grabación</span>
                  <div class="recording-controls">
                    <button type="button" class="btn" id="record-toggle">🎙️ Grabar</button>
                    <p class="recording-status" id="recording-status" hidden></p>
                    <audio class="recording-player" id="recording-player" controls hidden></audio>
                  </div>
                </div>`
          }
          ${
            song.updatedBy
              ? `<p class="sheet-updated-by">Última edición: ${escapeHtml(song.updatedBy)}</p>`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  const baseSong = parseChordPro(song.chordpro);
  let semitones = 0;
  let instrument = getInstrument();
  let mostrarDiagramas = getMostrarDiagramas();
  let fontSize = 1.9; // rem — mismo valor que el default de .lyrics-container en styles.css
  const FONT_STEP = 0.2;
  const FONT_MIN = 1.2;
  const FONT_MAX = 3.4;

  let lineHeight = 1.7; // mismo valor que el default de .lyrics-container en styles.css
  const LINE_HEIGHT_STEP = 0.2;
  const LINE_HEIGHT_MIN = 1.2;
  const LINE_HEIGHT_MAX = 3.4;

  let notation = getChordNotation();

  const lyricsContainer = container.querySelector('#lyrics-container');
  const transposeValueEl = container.querySelector('#transpose-value');

  const toneBadgeEl = container.querySelector('#tone-badge');
  const toneBtn = container.querySelector('#tone-btn');
  const stripEl = container.querySelector('#chord-strip');
  const layoutEl = container.querySelector('#song-layout');

  // Panel de diagramas al costado de la letra: los acordes DISTINTOS de la
  // canción, en el orden en que aparecen, dibujados para el instrumento
  // elegido. Se arma leyendo los acordes ya renderizados, así acompaña solo
  // el tono transpuesto y el cifrado (Do/C) que se esté viendo. Tocar uno
  // abre el diagrama grande (con todas las posiciones en guitarra).
  function renderChordStrip() {
    stripEl.innerHTML = '';
    const names = [];
    lyricsContainer.querySelectorAll('.chord').forEach((el) => {
      const name = el.textContent.trim();
      if (name && !names.includes(name)) names.push(name);
    });
    const visible = mostrarDiagramas && names.length > 0;
    stripEl.hidden = !visible;
    layoutEl.classList.toggle('con-diagramas', visible);
    stripEl.dataset.instrument = instrument;
    if (!visible) return;
    for (const name of names) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chord-strip-item';
      item.innerHTML = `<span class="chord-strip-name">${escapeHtml(name)}</span><div class="chord-strip-diagram"></div>`;
      // Primero se agrega a la página y recién después se dibuja: la librería
      // de guitarra busca su contenedor en el documento y falla si todavía no
      // está ahí.
      stripEl.appendChild(item);
      const slot = item.querySelector('.chord-strip-diagram');
      if (instrument === 'piano') {
        renderPianoDiagram(slot, name);
      } else {
        const voicings = getGuitarVoicings(name);
        if (voicings.length > 0) drawGuitarVoicing(slot, voicings[0]);
        else slot.textContent = 'Sin diagrama';
      }
      item.addEventListener('click', () => showChordPopover(name, () => instrument));
    }
  }

  function renderLyrics() {
    lyricsContainer.innerHTML = renderSong(baseSong, semitones, notation);
    renderChordStrip();
    // El boton de tono muestra cuanto se transpuso (+2, -1...) y se marca
    // cuando hay un cambio, para que se note de un vistazo.
    toneBadgeEl.textContent = semitones > 0 ? `+${semitones}` : semitones < 0 ? `−${Math.abs(semitones)}` : '0';
    toneBtn.classList.toggle('on', semitones !== 0);
  }
  renderLyrics();

  // El tamaño de letra queda como estilo inline sobre el contenedor: no se
  // pierde al re-renderizar la letra (transponer) porque eso solo reemplaza
  // el innerHTML, no los estilos del propio contenedor.
  function applyFontSize() {
    lyricsContainer.style.fontSize = `${fontSize}rem`;
  }
  applyFontSize();

  function applyLineHeight() {
    lyricsContainer.style.lineHeight = lineHeight;
  }
  applyLineHeight();

  lyricsContainer.classList.toggle('hide-chords', !getShowChords());

  // "Ajustar a la pantalla": la letra arranca en el tamaño más grande (hasta
  // el de siempre) con el que la canción ENTERA entra en la pantalla, sin
  // scroll. Si ni achicándola hasta FIT_MIN_FONT entra (una canción muy
  // larga), se deja como siempre —tamaño cómodo, con scroll— en vez de
  // dejarla ilegible. Se recalcula al transponer, mostrar/ocultar acordes,
  // ocultar el panel, girar el celular, etc. Tocar A+/A− o pellizcar lo
  // apaga solo para esta canción: ahí manda lo que se elige a mano.
  const FIT_MAX_FONT = 1.9;
  const FIT_MIN_FONT = 0.8;
  const FIT_FONT_STEP = 0.05;
  const FIT_LINE_HEIGHT = 1.45;
  let ajustar = getAjustarPantalla();
  const fitBtn = container.querySelector('#fit-btn');
  const fitStatusEl = container.querySelector('#fit-status');
  const floatingScrollEl = container.querySelector('#floating-scroll-toggle');

  // Aviso corto que se apaga solo (no queda tapando la letra).
  let fitStatusTimer = null;
  function setFitStatus(text) {
    clearTimeout(fitStatusTimer);
    fitStatusEl.hidden = !text;
    fitStatusEl.textContent = text || '';
    if (text) {
      fitStatusTimer = setTimeout(() => {
        fitStatusEl.hidden = true;
      }, 3500);
    }
  }

  function updateFitBtn() {
    fitBtn.classList.toggle('on', ajustar);
    fitBtn.setAttribute('aria-pressed', String(ajustar));
  }

  function fitToScreen() {
    updateFitBtn();
    if (!ajustar) {
      lyricsContainer.classList.remove('fit-pantalla');
      floatingScrollEl.style.display = '';
      setFitStatus('');
      return;
    }
    lyricsContainer.classList.add('fit-pantalla');
    lyricsContainer.style.lineHeight = FIT_LINE_HEIGHT;
    let size = FIT_MAX_FONT;
    let cabe = false;
    while (size >= FIT_MIN_FONT - 0.001) {
      lyricsContainer.style.fontSize = `${size}rem`;
      // scrollHeight incluye el relleno: si no supera lo visible, entra todo.
      if (lyricsContainer.scrollHeight <= lyricsContainer.clientHeight + 1) {
        cabe = true;
        break;
      }
      size = +(size - FIT_FONT_STEP).toFixed(2);
    }
    if (cabe) {
      fontSize = size;
      lineHeight = FIT_LINE_HEIGHT;
      // Si entra toda la canción, el play/pausa del scroll no tiene nada que hacer.
      floatingScrollEl.style.display = 'none';
      setFitStatus('');
    } else {
      // Muy larga para achicarla sin que se vuelva ilegible: tamaño de siempre.
      lyricsContainer.classList.remove('fit-pantalla');
      applyFontSize();
      applyLineHeight();
      floatingScrollEl.style.display = '';
      setFitStatus('Canción larga: se ve con scroll.');
    }
  }

  function turnOffFitForThisSong() {
    if (!ajustar) return;
    ajustar = false;
    fitToScreen();
  }

  // El boton enciende o apaga el ajuste y lo recuerda para las proximas
  // canciones (A+/A- lo apagan solo para la cancion que se esta viendo).
  fitBtn.addEventListener('click', () => {
    ajustar = !ajustar;
    setAjustarPantalla(ajustar);
    if (!ajustar) {
      fontSize = 1.9;
      lineHeight = 1.7;
      applyFontSize();
      applyLineHeight();
    }
    fitToScreen();
  });

  // Se mide cuando la letra ya tiene su lugar en pantalla y cada vez que
  // cambia el espacio disponible (girar, pantalla completa, ocultar el panel).
  let fitLastSize = '';
  const fitObserver = new ResizeObserver(() => {
    const key = `${lyricsContainer.clientWidth}x${lyricsContainer.clientHeight}`;
    if (key === fitLastSize) return;
    fitLastSize = key;
    fitToScreen();
  });
  fitObserver.observe(lyricsContainer);
  document.fonts?.ready?.then(() => fitToScreen());
  window.addEventListener('hashchange', () => fitObserver.disconnect(), { once: true });

  container.querySelector('#fontsize-up').addEventListener('click', () => {
    turnOffFitForThisSong();
    fontSize = Math.min(FONT_MAX, fontSize + FONT_STEP);
    applyFontSize();
  });
  container.querySelector('#fontsize-down').addEventListener('click', () => {
    turnOffFitForThisSong();
    fontSize = Math.max(FONT_MIN, fontSize - FONT_STEP);
    applyFontSize();
  });

  container.querySelector('#lineheight-up').addEventListener('click', () => {
    turnOffFitForThisSong();
    lineHeight = Math.min(LINE_HEIGHT_MAX, +(lineHeight + LINE_HEIGHT_STEP).toFixed(2));
    applyLineHeight();
  });
  container.querySelector('#lineheight-down').addEventListener('click', () => {
    turnOffFitForThisSong();
    lineHeight = Math.max(LINE_HEIGHT_MIN, +(lineHeight - LINE_HEIGHT_STEP).toFixed(2));
    applyLineHeight();
  });

  // Pellizco con dos dedos sobre la letra, igual que el zoom: separar los
  // dedos agranda el interlineado, juntarlos lo achica. Comparte variable y
  // límites con los botones de arriba. touch-action: pan-y en
  // .lyrics-container (ver styles.css) evita que el navegador intente hacer
  // zoom de página de verdad con el mismo gesto.
  let lineHeightAtPinchStart = lineHeight;
  attachPinchZoom(lyricsContainer, {
    onPinchStart: () => {
      lineHeightAtPinchStart = lineHeight;
    },
    onPinchMove: (scale) => {
      turnOffFitForThisSong();
      const next = lineHeightAtPinchStart * scale;
      lineHeight = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, +next.toFixed(2)));
      applyLineHeight();
    },
  });

  container.querySelector('#show-chords-input').addEventListener('change', (event) => {
    setShowChords(event.target.checked);
    lyricsContainer.classList.toggle('hide-chords', !event.target.checked);
    fitToScreen();
  });

  container.querySelector('#chord-notation-input').addEventListener('change', (event) => {
    notation = event.target.checked ? 'solfege' : 'symbol';
    setChordNotation(notation);
    renderLyrics();
    fitToScreen();
  });

  container.querySelector('#transpose-up').addEventListener('click', () => {
    semitones += 1;
    transposeValueEl.textContent = semitones;
    renderLyrics();
    fitToScreen();
  });
  container.querySelector('#transpose-down').addEventListener('click', () => {
    semitones -= 1;
    transposeValueEl.textContent = semitones;
    renderLyrics();
    fitToScreen();
  });

  container.querySelectorAll('input[name="instrument"]').forEach((radio) => {
    radio.addEventListener('change', (event) => {
      instrument = event.target.value;
      setInstrument(instrument);
      renderChordStrip();
    });
  });

  container.querySelector('#show-diagrams-input').addEventListener('change', (event) => {
    mostrarDiagramas = event.target.checked;
    setMostrarDiagramas(mostrarDiagramas);
    renderChordStrip();
    fitToScreen();
  });

  // Autoscroll. 15px/s de arranque (antes eran 40, muy rápido para seguirlo
  // cantando): a esa velocidad una línea de letra tarda varios segundos en
  // desaparecer arriba, en vez de un segundo y medio.
  let scrollSpeed = 15;
  const SCROLL_SPEED_STEP = 5;
  const SCROLL_SPEED_MIN = 4;
  const SCROLL_SPEED_MAX = 100;
  const scroller = createAutoScroller(lyricsContainer, { initialSpeed: scrollSpeed });
  const scrollToggleBtn = container.querySelector('#scroll-toggle');
  const floatingScrollBtn = container.querySelector('#floating-scroll-toggle');
  const speedValueEl = container.querySelector('#speed-value');

  // Cuenta regresiva antes de arrancar: da tiempo a acomodarse (o a que
  // termine la introducción tocada sola) antes de que la letra empiece a
  // moverse. Cambiar acá si hace falta más o menos margen.
  const START_DELAY_SECONDS = 18;
  let countingDown = false;
  let countdownRemaining = 0;
  let countdownIntervalId = null;

  function cancelStartDelay() {
    if (countdownIntervalId != null) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    countingDown = false;
  }

  function startWithDelay() {
    countingDown = true;
    countdownRemaining = START_DELAY_SECONDS;
    updateScrollToggleButtons();
    countdownIntervalId = setInterval(() => {
      countdownRemaining -= 1;
      if (countdownRemaining <= 0) {
        cancelStartDelay();
        scroller.play();
      }
      updateScrollToggleButtons();
    }, 1000);
  }

  // El botón flotante repite el play/pausa del panel: sigue visible aunque
  // se oculte el panel de controles o se entre en pantalla completa, que es
  // justo cuando más hace falta poder parar/seguir el scroll sin tocar nada
  // más en pantalla. Los dos íconos se actualizan siempre juntos desde acá.
  function updateScrollToggleButtons() {
    const icon = countingDown ? String(countdownRemaining) : scroller.isRunning() ? '⏸' : '▶';
    scrollToggleBtn.textContent = icon;
    floatingScrollBtn.textContent = icon;
    floatingScrollBtn.classList.toggle('running', scroller.isRunning() || countingDown);
  }

  // Tres casos: contando -> cancela la cuenta; corriendo -> pausa; parado ->
  // empieza la cuenta (el movimiento recién arranca al llegar a 0).
  function toggleScroll() {
    if (countingDown) {
      cancelStartDelay();
    } else if (scroller.isRunning()) {
      scroller.pause();
    } else {
      startWithDelay();
    }
    updateScrollToggleButtons();
  }
  scrollToggleBtn.addEventListener('click', toggleScroll);
  container.querySelector('#scroll-reset').addEventListener('click', () => {
    cancelStartDelay();
    scroller.reset();
    updateScrollToggleButtons();
  });
  // Botones +/− en vez de una barra deslizable: en pantalla completa, en un
  // celular, una barra tan chica es casi imposible de mover con precisión;
  // con botones grandes alcanza con tocar (mismo patrón que tamaño de letra
  // e interlineado, más arriba).
  function applySpeed() {
    scroller.setSpeed(scrollSpeed);
    speedValueEl.textContent = scrollSpeed;
  }
  container.querySelector('#speed-down').addEventListener('click', () => {
    scrollSpeed = Math.max(SCROLL_SPEED_MIN, scrollSpeed - SCROLL_SPEED_STEP);
    applySpeed();
  });
  container.querySelector('#speed-up').addEventListener('click', () => {
    scrollSpeed = Math.min(SCROLL_SPEED_MAX, scrollSpeed + SCROLL_SPEED_STEP);
    applySpeed();
  });

  // El botón flotante hace dos cosas, distinguidas por si hubo arrastre: un
  // toque simple (sin mover el dedo) es play/pausa; arrastrar hacia arriba o
  // abajo sube o baja la velocidad en caliente, sin soltar el botón — para
  // frenar o acelerar sobre la marcha sin ir a buscar los botones +/− del
  // panel (que además puede estar oculto).
  const speedHintEl = container.querySelector('#floating-speed-hint');
  const DRAG_DEADZONE = 8; // px antes de considerar que es arrastre y no toque
  const DRAG_PX_PER_STEP = 10; // px de arrastre por cada paso
  const DRAG_STEP = 2; // unidades de velocidad por paso (más fino que los botones +/−)
  let drag = null;
  let speedHintTimeout = null;

  function showSpeedHint() {
    speedHintEl.textContent = scrollSpeed;
    speedHintEl.hidden = false;
    clearTimeout(speedHintTimeout);
    speedHintTimeout = setTimeout(() => {
      speedHintEl.hidden = true;
    }, 900);
  }

  floatingScrollBtn.addEventListener('pointerdown', (event) => {
    drag = { startY: event.clientY, startSpeed: scrollSpeed, dragging: false };
    floatingScrollBtn.setPointerCapture(event.pointerId);
  });

  floatingScrollBtn.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const deltaY = drag.startY - event.clientY; // positivo = arrastre hacia arriba
    if (!drag.dragging && Math.abs(deltaY) < DRAG_DEADZONE) return;
    drag.dragging = true;
    const steps = Math.round(deltaY / DRAG_PX_PER_STEP);
    const newSpeed = Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, drag.startSpeed + steps * DRAG_STEP));
    if (newSpeed !== scrollSpeed) {
      scrollSpeed = newSpeed;
      applySpeed();
      showSpeedHint();
    }
  });

  function endDrag() {
    if (!drag) return;
    const wasDragging = drag.dragging;
    drag = null;
    if (!wasDragging) toggleScroll();
  }
  floatingScrollBtn.addEventListener('pointerup', endDrag);
  floatingScrollBtn.addEventListener('pointercancel', endDrag);

  // Si se navega a otra pantalla con algo corriendo, lo frenamos: si no,
  // sigue moviendo (en vano) un contenedor de letra que ya no está en
  // pantalla, gastando batería sin que se note.
  window.addEventListener(
    'hashchange',
    () => {
      cancelStartDelay();
      scroller.pause();
    },
    { once: true }
  );

  // Grabación: un botón para grabar cómo canta el grupo ESTA canción ahora
  // mismo. Requiere login (necesita saber la parroquia para guardarla en el
  // lugar correcto y, sobre todo, para que Supabase la acepte por RLS). Se
  // sube con la clave espacio+grupo+canción, así volver a grabar la misma
  // canción con el mismo grupo reemplaza la grabación anterior en vez de
  // acumular archivos sueltos (ver storage/recordings.js).
  if (puedeEditar) {
    const recordBtn = container.querySelector('#record-toggle');
    const recordingStatusEl = container.querySelector('#recording-status');
    const recordingPlayerEl = container.querySelector('#recording-player');
    const audioRecorder = createAudioRecorder();

    const showRecordingStatus = (text) => {
      recordingStatusEl.hidden = false;
      recordingStatusEl.textContent = text;
    };

    recordBtn.addEventListener('click', async () => {
      if (!audioRecorder.isRecording()) {
        if (!isSupabaseConfigured) {
          showRecordingStatus('Falta configurar Supabase.');
          return;
        }
        const session = await getSession();
        if (!session) {
          showRecordingStatus('Hace falta iniciar sesión para grabar.');
          return;
        }
        try {
          await audioRecorder.start();
        } catch (err) {
          console.error(err);
          showRecordingStatus('No se pudo acceder al micrófono.');
          return;
        }
        recordBtn.textContent = '⏹ Detener';
        recordingPlayerEl.hidden = true;
        showRecordingStatus('Grabando...');
        return;
      }

      recordBtn.textContent = '🎙️ Grabar';
      recordBtn.disabled = true;
      showRecordingStatus('Subiendo...');
      try {
        const blob = await audioRecorder.stop();
        const spaceKey = getCurrentSpaceKey();
        const groupName = getDeviceGroup();
        const url = await uploadSongRecording({
          spaceKey,
          spaceName: getSpaceFullLabel(spaceKey),
          groupName,
          songUuid: song.uuid,
          songTitle: song.title,
          blob,
        });
        recordingPlayerEl.src = url;
        recordingPlayerEl.hidden = false;
        showRecordingStatus(`✓ Guardada como grabación de ${groupName || 'tu parroquia'}.`);
      } catch (err) {
        console.error(err);
        showRecordingStatus('No se pudo guardar la grabación. Probá de nuevo.');
      } finally {
        recordBtn.disabled = false;
      }
    });
  }

  // Barra flotante (a un costado, al alcance del pulgar) y hoja "Más
  // opciones". El tono abre un selector chico al lado de la barra; lo que casi
  // no se toca (acordes, instrumento, interlineado, grabar...) vive en la hoja.
  const toneChipEl = container.querySelector('#tone-chip');
  const sheetEl = container.querySelector('#song-sheet');
  const sheetBackdropEl = container.querySelector('#sheet-backdrop');
  const closeToneChip = () => {
    toneChipEl.hidden = true;
  };
  toneBtn.addEventListener('click', () => {
    toneChipEl.hidden = !toneChipEl.hidden;
  });
  function setSheet(open) {
    sheetEl.hidden = !open;
    sheetBackdropEl.hidden = !open;
    if (open) closeToneChip();
  }
  container.querySelector('#more-btn').addEventListener('click', () => setSheet(sheetEl.hidden));
  container.querySelector('#sheet-close').addEventListener('click', () => setSheet(false));
  sheetBackdropEl.addEventListener('click', () => setSheet(false));
  updateFitBtn();

  // Pantalla completa real (oculta la barra del navegador en la tablet). En
  // iOS Safari viejo no existe esta API para elementos genéricos: si no está
  // disponible, directamente escondemos el botón en vez de que falle mudo.
  const fullscreenBtn = container.querySelector('#fullscreen-toggle');
  const canFullscreen = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  if (!canFullscreen) {
    fullscreenBtn.style.display = 'none';
  } else {
    fullscreenBtn.addEventListener('click', () => {
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFullscreen) {
        const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        request.call(document.documentElement).catch(() => {});
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        exit.call(document);
      }
    });
  }

  // Tocar un acorde renderizado abre su diagrama (guitarra o piano). Tocar
  // cualquier otra parte de la letra esconde la barra de botones (queda solo
  // el play y "Más") para cantar con la canción limpia; otro toque la vuelve.
  lyricsContainer.addEventListener('click', (event) => {
    const chordEl = event.target.closest('.chord');
    if (chordEl && chordEl.textContent.trim()) {
      showChordPopover(chordEl.textContent.trim(), () => instrument);
      return;
    }
    closeToneChip();
    layoutEl.classList.toggle('dock-hidden');
    fitToScreen();
  });

  const updatePublishedBtn = container.querySelector('#update-published-btn');
  if (updatePublishedBtn) {
    updatePublishedBtn.addEventListener('click', async () => {
      updatePublishedBtn.disabled = true;
      const original = updatePublishedBtn.textContent;
      updatePublishedBtn.textContent = 'Actualizando...';
      try {
        const { updated } = await updatePublishedSong(song);
        updatePublishedBtn.textContent = updated ? '✓ Actualizada' : 'No estaba en la lista publicada';
      } catch (err) {
        console.error(err);
        updatePublishedBtn.textContent = 'No se pudo actualizar';
      } finally {
        setTimeout(() => {
          updatePublishedBtn.textContent = original;
          updatePublishedBtn.disabled = false;
        }, 2500);
      }
    });
  }

  container.querySelector('#delete-btn')?.addEventListener('click', async () => {
    if (confirm(`¿Eliminar "${song.title}"?`)) {
      const deleted = await deleteSong(song.id);
      // Esperamos a que el borrado quede confirmado en el servidor ANTES de
      // navegar — si no, la sincronización que se dispara sola al entrar a
      // la biblioteca puede llegar primero y, como todavía no ve el
      // borrado en la nube, "resucita" la canción que acabamos de borrar.
      if (deleted) await propagateDelete(deleted);
      window.location.hash = backHref;
      syncNow();
    }
  });
}

function showChordPopover(chordName, getInstrument) {
  const backdrop = document.createElement('div');
  backdrop.className = 'chord-popover-backdrop';

  const popover = document.createElement('div');
  popover.className = 'chord-popover';
  popover.style.top = '50%';
  popover.style.left = '50%';
  popover.style.transform = 'translate(-50%, -50%)';
  popover.innerHTML = `
    <h3>${escapeHtml(chordName)}</h3>
    <div id="diagram-slot"></div>
    <div class="chord-popover-nav" id="chord-popover-nav" hidden>
      <button class="btn btn-icon" id="voicing-prev">‹</button>
      <div class="chord-popover-dots" id="chord-popover-dots"></div>
      <button class="btn btn-icon" id="voicing-next">›</button>
    </div>
  `;

  function close() {
    backdrop.remove();
    popover.remove();
  }
  backdrop.addEventListener('click', close);

  document.body.appendChild(backdrop);
  document.body.appendChild(popover);

  const slot = popover.querySelector('#diagram-slot');

  if (getInstrument() === 'piano') {
    // El piano muestra siempre el mismo puñado de teclas resaltadas sin
    // importar la digitación, así que no tiene sentido navegar "posiciones"
    // como en la guitarra: un solo diagrama alcanza.
    renderPianoDiagram(slot, chordName);
    return;
  }

  const voicings = getGuitarVoicings(chordName);
  if (voicings.length === 0) {
    slot.textContent = `Sin diagrama para "${chordName}"`;
    return;
  }

  let index = 0;
  const navEl = popover.querySelector('#chord-popover-nav');
  const dotsEl = popover.querySelector('#chord-popover-dots');

  function renderVoicing() {
    drawGuitarVoicing(slot, voicings[index]);
    dotsEl.innerHTML = voicings
      .map((_, i) => `<span class="chord-popover-dot${i === index ? ' active' : ''}"></span>`)
      .join('');
  }

  if (voicings.length > 1) {
    navEl.hidden = false;
    popover.querySelector('#voicing-prev').addEventListener('click', () => {
      index = (index - 1 + voicings.length) % voicings.length;
      renderVoicing();
    });
    popover.querySelector('#voicing-next').addEventListener('click', () => {
      index = (index + 1) % voicings.length;
      renderVoicing();
    });
  }

  renderVoicing();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
