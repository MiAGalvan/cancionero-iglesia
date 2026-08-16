// Vista de una canción: letra + acordes, transposición, autoscroll y
// diagramas de acordes al tocar uno. Los controles viven en un panel lateral
// (se puede ocultar del todo) para que la letra tenga el máximo de espacio.
import { getSong, deleteSong } from '../storage/db.js';
import { propagateDelete, syncNow } from '../storage/sync.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { createAutoScroller } from '../scroll/autoScroll.js';
import { getGuitarVoicings, drawGuitarVoicing } from '../diagrams/guitarDiagram.js';
import { renderPianoDiagram } from '../diagrams/pianoDiagram.js';
import { getShowChords, setShowChords, getChordNotation, setChordNotation } from '../storage/settings.js';

export async function renderSongView(container, { id }) {
  const song = await getSong(Number(id));
  if (!song) {
    container.innerHTML = `<div class="empty-state">No se encontró la canción. <a href="#/library">Volver</a></div>`;
    return;
  }

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Biblioteca</a>
      <h2>${escapeHtml(song.title)}</h2>
      <div class="form-actions">
        <button class="btn btn-icon" id="sidebar-toggle" title="Mostrar/ocultar controles">☰</button>
        <button class="btn btn-icon" id="fullscreen-toggle" title="Pantalla completa">⛶</button>
        <a class="btn" href="#/song/${song.id}/edit">Editar</a>
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
              <button class="btn btn-icon" id="scroll-toggle">▶</button>
              <button class="btn" id="scroll-reset">Inicio</button>
            </div>
            <div class="scroll-speed-row">
              <input type="range" id="scroll-speed" class="speed-slider" min="4" max="100" value="15" />
              <span class="speed-value" id="speed-value">15</span>
            </div>
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
  const scroller = createAutoScroller(lyricsContainer, { initialSpeed: 15 });
  const scrollToggleBtn = container.querySelector('#scroll-toggle');
  const speedValueEl = container.querySelector('#speed-value');
  scrollToggleBtn.addEventListener('click', () => {
    scroller.toggle();
    scrollToggleBtn.textContent = scroller.isRunning() ? '⏸' : '▶';
  });
  container.querySelector('#scroll-reset').addEventListener('click', () => {
    scroller.reset();
  });
  container.querySelector('#scroll-speed').addEventListener('input', (event) => {
    const speed = Number(event.target.value);
    scroller.setSpeed(speed);
    speedValueEl.textContent = speed;
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

  container.querySelector('#delete-btn').addEventListener('click', async () => {
    if (confirm(`¿Eliminar "${song.title}"?`)) {
      const deleted = await deleteSong(song.id);
      window.location.hash = '#/library';
      if (deleted) propagateDelete(deleted.uuid).then(() => syncNow());
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
