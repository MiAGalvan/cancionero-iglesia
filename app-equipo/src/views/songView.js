// Vista de una canción: letra + acordes, transposición, autoscroll y
// diagramas de acordes al tocar uno. Los controles viven en un panel lateral
// (se puede ocultar del todo) para que la letra tenga el máximo de espacio.
import { getSong, deleteSong } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { createAutoScroller } from '../scroll/autoScroll.js';
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
} from '../storage/settings.js';
import { getSession } from '../storage/auth.js';
import { createAudioRecorder } from '../recorder/audioRecorder.js';
import { uploadSongRecording } from '../storage/recordings.js';
import { isSupabaseConfigured } from '../storage/supabaseClient.js';
import { updatePublishedSong } from '../liturgia/publicar.js';

export async function renderSongView(container, { id, returnTo }) {
  const song = await getSong(Number(id));
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
          fromListaPublicada
            ? `<button class="btn" id="update-published-btn">🔄 Actualizar en la lista publicada</button>`
            : ''
        }
        <button class="btn btn-icon" id="sidebar-toggle" title="Mostrar/ocultar controles">☰</button>
        <button class="btn btn-icon" id="fullscreen-toggle" title="Pantalla completa">⛶</button>
        <a class="btn" href="#/song/${song.id}/edit${returnToQuery}">Editar</a>
        <button class="btn btn-danger" id="delete-btn">Eliminar</button>
      </div>
    </div>
    <div class="song-layout">
      <aside class="song-sidebar" id="song-sidebar">
        ${
          song.updatedBy
            ? `<div class="sidebar-group song-updated-by-group">
                <h3>Última edición</h3>
                <p class="song-updated-by">${escapeHtml(song.updatedBy)}</p>
              </div>`
            : ''
        }
        <div class="sidebar-group">
          <h3>Transporte</h3>
          <div class="transpose-controls">
            <button class="btn btn-icon" id="transpose-down">−</button>
            <span class="transpose-value" id="transpose-value">0</span>
            <button class="btn btn-icon" id="transpose-up">+</button>
          </div>
        </div>
        <div class="sidebar-group">
          <h3>Tamaño de letra</h3>
          <div class="fontsize-controls">
            <button class="btn btn-icon" id="fontsize-down">A−</button>
            <button class="btn btn-icon" id="fontsize-up">A+</button>
          </div>
        </div>
        <div class="sidebar-group">
          <h3>Interlineado</h3>
          <div class="fontsize-controls">
            <button class="btn btn-icon" id="lineheight-down">≡−</button>
            <button class="btn btn-icon" id="lineheight-up">≡+</button>
          </div>
        </div>
        <div class="sidebar-group">
          <h3>Acordes</h3>
          <label class="shared-field">
            <input type="checkbox" id="show-chords-input" ${getShowChords() ? 'checked' : ''} />
            Acordes
          </label>
          <label class="shared-field">
            <input type="checkbox" id="chord-notation-input" ${getChordNotation() === 'solfege' ? 'checked' : ''} />
            Cifrado europeo (Do, Re, Mi...)
          </label>
        </div>
        <div class="sidebar-group">
          <h3>Instrumento</h3>
          <div class="instrument-controls">
            <label><input type="radio" name="instrument" value="guitar" checked /> Guitarra</label>
            <label><input type="radio" name="instrument" value="piano" /> Piano</label>
          </div>
        </div>
        <div class="sidebar-group">
          <h3>Scroll automático</h3>
          <div class="scroll-controls">
            <div class="scroll-buttons">
              <button class="btn btn-icon btn-scroll-toggle" id="scroll-toggle">▶</button>
              <button class="btn" id="scroll-reset">Inicio</button>
            </div>
            <div class="scroll-speed-row fontsize-controls">
              <button class="btn btn-icon" id="speed-down">−</button>
              <span class="speed-value" id="speed-value">15</span>
              <button class="btn btn-icon" id="speed-up">+</button>
            </div>
          </div>
        </div>
        <div class="sidebar-group">
          <h3>Grabación</h3>
          <div class="recording-controls">
            <button class="btn" id="record-toggle">🎙️ Grabar</button>
            <p class="recording-status" id="recording-status" hidden></p>
            <audio class="recording-player" id="recording-player" controls hidden></audio>
          </div>
        </div>
      </aside>
      <div class="lyrics-container" id="lyrics-container"></div>
    </div>
  `;

  const baseSong = parseChordPro(song.chordpro);
  let semitones = 0;
  let instrument = 'guitar';
  let fontSize = 1.9; // rem — mismo valor que el default de .lyrics-container en styles.css
  const FONT_STEP = 0.2;
  const FONT_MIN = 1.2;
  const FONT_MAX = 3.4;

  let lineHeight = 1.7; // mismo valor que el default de .lyrics-container en styles.css
  const LINE_HEIGHT_STEP = 0.2;
  const LINE_HEIGHT_MIN = 1.1;
  const LINE_HEIGHT_MAX = 2.6;

  let notation = getChordNotation();

  const lyricsContainer = container.querySelector('#lyrics-container');
  const transposeValueEl = container.querySelector('#transpose-value');

  function renderLyrics() {
    lyricsContainer.innerHTML = renderSong(baseSong, semitones, notation);
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

  container.querySelector('#fontsize-up').addEventListener('click', () => {
    fontSize = Math.min(FONT_MAX, fontSize + FONT_STEP);
    applyFontSize();
  });
  container.querySelector('#fontsize-down').addEventListener('click', () => {
    fontSize = Math.max(FONT_MIN, fontSize - FONT_STEP);
    applyFontSize();
  });

  container.querySelector('#lineheight-up').addEventListener('click', () => {
    lineHeight = Math.min(LINE_HEIGHT_MAX, +(lineHeight + LINE_HEIGHT_STEP).toFixed(1));
    applyLineHeight();
  });
  container.querySelector('#lineheight-down').addEventListener('click', () => {
    lineHeight = Math.max(LINE_HEIGHT_MIN, +(lineHeight - LINE_HEIGHT_STEP).toFixed(1));
    applyLineHeight();
  });

  container.querySelector('#show-chords-input').addEventListener('change', (event) => {
    setShowChords(event.target.checked);
    lyricsContainer.classList.toggle('hide-chords', !event.target.checked);
  });

  container.querySelector('#chord-notation-input').addEventListener('change', (event) => {
    notation = event.target.checked ? 'solfege' : 'symbol';
    setChordNotation(notation);
    renderLyrics();
  });

  container.querySelector('#transpose-up').addEventListener('click', () => {
    semitones += 1;
    transposeValueEl.textContent = semitones;
    renderLyrics();
  });
  container.querySelector('#transpose-down').addEventListener('click', () => {
    semitones -= 1;
    transposeValueEl.textContent = semitones;
    renderLyrics();
  });

  container.querySelectorAll('input[name="instrument"]').forEach((radio) => {
    radio.addEventListener('change', (event) => {
      instrument = event.target.value;
    });
  });

  // Autoscroll. 15px/s de arranque (antes eran 40, muy rápido para seguirlo
  // cantando): a esa velocidad una línea de letra tarda varios segundos en
  // desaparecer arriba, en vez de un segundo y medio.
  let scrollSpeed = 15;
  const SCROLL_SPEED_STEP = 5;
  const SCROLL_SPEED_MIN = 5;
  const SCROLL_SPEED_MAX = 100;
  const scroller = createAutoScroller(lyricsContainer, { initialSpeed: scrollSpeed });
  const scrollToggleBtn = container.querySelector('#scroll-toggle');
  const speedValueEl = container.querySelector('#speed-value');
  scrollToggleBtn.addEventListener('click', () => {
    scroller.toggle();
    scrollToggleBtn.textContent = scroller.isRunning() ? '⏸' : '▶';
  });
  container.querySelector('#scroll-reset').addEventListener('click', () => {
    scroller.reset();
  });
  // Botones +/− en vez de una barra deslizable: en pantalla completa, en un
  // celular, una barra tan chica es casi imposible de mover con precisión;
  // con botones grandes alcanza con tocar (mismo patrón que tamaño de letra
  // e interlineado, más arriba).
  container.querySelector('#speed-down').addEventListener('click', () => {
    scrollSpeed = Math.max(SCROLL_SPEED_MIN, scrollSpeed - SCROLL_SPEED_STEP);
    scroller.setSpeed(scrollSpeed);
    speedValueEl.textContent = scrollSpeed;
  });
  container.querySelector('#speed-up').addEventListener('click', () => {
    scrollSpeed = Math.min(SCROLL_SPEED_MAX, scrollSpeed + SCROLL_SPEED_STEP);
    scroller.setSpeed(scrollSpeed);
    speedValueEl.textContent = scrollSpeed;
  });

  // Grabación: un botón para grabar cómo canta el grupo ESTA canción ahora
  // mismo. Requiere login (necesita saber la parroquia para guardarla en el
  // lugar correcto y, sobre todo, para que Supabase la acepte por RLS). Se
  // sube con la clave espacio+grupo+canción, así volver a grabar la misma
  // canción con el mismo grupo reemplaza la grabación anterior en vez de
  // acumular archivos sueltos (ver storage/recordings.js).
  const recordBtn = container.querySelector('#record-toggle');
  const recordingStatusEl = container.querySelector('#recording-status');
  const recordingPlayerEl = container.querySelector('#recording-player');
  const audioRecorder = createAudioRecorder();

  function showRecordingStatus(text) {
    recordingStatusEl.hidden = false;
    recordingStatusEl.textContent = text;
  }

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

  // Ocultar/mostrar el panel de controles: con el panel oculto la letra usa
  // todo el ancho de la pantalla.
  const sidebarEl = container.querySelector('#song-sidebar');
  container.querySelector('#sidebar-toggle').addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
  });

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

  // Tocar un acorde renderizado abre su diagrama (guitarra o piano).
  lyricsContainer.addEventListener('click', (event) => {
    const chordEl = event.target.closest('.chord');
    if (!chordEl || !chordEl.textContent.trim()) return;
    showChordPopover(chordEl.textContent.trim(), () => instrument);
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

  container.querySelector('#delete-btn').addEventListener('click', async () => {
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
