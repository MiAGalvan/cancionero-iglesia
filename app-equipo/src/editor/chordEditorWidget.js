// Editor visual de acordes: el guitarrista escribe la letra a mano (sin
// acordes) y después toca cada palabra para ponerle el acorde que va
// arriba. Vive aparte de newSongView.js para no llenarlo de lógica de UI;
// se comunica con él solo a través de `onChordProChange`, que se llama cada
// vez que cambia el texto ChordPro resultante (newSongView lo usa para
// mantener sincronizado el textarea de ChordPro de siempre, y así no hace
// falta tocar la lógica de "Guardar").
import {
  buildEditorLines,
  chordProToEditorLines,
  editorLinesToChordPro,
  normalizeTypedChord,
  preserveChords,
} from './chordProBuilder.js';
import { openFullscreenTextEditor } from './fullscreenTextEditor.js';
import { wrapSelectionInBold } from './textareaBold.js';

export function renderChordEditor(container, { initialChordpro, onChordProChange }) {
  const hasInitial = Boolean(initialChordpro && initialChordpro.trim());
  const state = {
    phase: hasInitial ? 'chords' : 'lyrics',
    editorLines: hasInitial ? chordProToEditorLines(initialChordpro) : [],
    plainLyricsText: hasInitial ? linesToPlainText(chordProToEditorLines(initialChordpro)) : '',
  };

  function notifyChange() {
    onChordProChange(editorLinesToChordPro(state.editorLines));
  }

  function render() {
    if (state.phase === 'lyrics') renderLyricsPhase();
    else renderChordsPhase();
  }

  // Poner (o correr) un acorde reconstruye toda la lista de líneas con
  // innerHTML — en una canción larga, si se estaba con el scroll bajado
  // para poner un acorde en el estribillo, eso volvía a subir la pantalla
  // al principio cada vez, obligando a bajar de nuevo para el siguiente
  // acorde.
  //
  // OJO: hay DOS scrolls distintos para guardar, no uno solo. ".form-view"
  // es el scroll de la pantalla entera — pero ".chord-editor-lines" (la
  // caja de las líneas) tiene su PROPIO scroll interno aparte (está topeada
  // a 45vh, con overflow-y:auto propio, ver styles.css). En una canción
  // larga, el scroll que realmente importa es el de esa caja interna: como
  // se reconstruye entera con innerHTML, su scroll interno se resetea a 0
  // cada vez si no se restaura a mano — eso era el bug real (guardar solo
  // el de ".form-view" no alcanzaba, esa nunca se movía).
  function rerenderPreservingScroll() {
    const outerScrollEl = container.closest('.form-view') || document.scrollingElement;
    const outerScrollTop = outerScrollEl ? outerScrollEl.scrollTop : 0;
    const innerScrollEl = container.querySelector('.chord-editor-lines');
    const innerScrollTop = innerScrollEl ? innerScrollEl.scrollTop : 0;

    render();

    if (outerScrollEl) outerScrollEl.scrollTop = outerScrollTop;
    const newInnerScrollEl = container.querySelector('.chord-editor-lines');
    if (newInnerScrollEl) newInnerScrollEl.scrollTop = innerScrollTop;
  }

  function renderLyricsPhase() {
    container.innerHTML = `
      <div class="textarea-field-header">
        <p class="chord-editor-hint">
          Escribí la letra, sin acordes. Dejá una línea en blanco donde vaya una
          intro o un interludio (ahí después se pueden poner acordes sueltos).
        </p>
        <div class="textarea-field-header-actions">
          <button type="button" class="btn btn-icon" id="bold-lyrics-btn" title="Resaltar en negrita lo seleccionado (ej. el estribillo)"><strong>B</strong></button>
          <button type="button" class="btn btn-icon expand-textarea-btn" id="expand-lyrics-btn" title="Editar en pantalla completa">⛶</button>
        </div>
      </div>
      <textarea id="plain-lyrics-input" rows="10" placeholder="Perdón, oh Dios, mi Padre y Señor...">${escapeHtml(
        state.plainLyricsText
      )}</textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="go-chords-btn">Poner acordes →</button>
      </div>
    `;

    const plainLyricsInput = container.querySelector('#plain-lyrics-input');

    // Sincroniza en cada tecla, no solo al tocar "Poner acordes →": así, si
    // alguien corrige un error de tipeo acá y va derecho al botón general
    // "Guardar" (sin pasar por la pantalla de acordes), la corrección igual
    // queda en el ChordPro que se guarda. Antes se perdía en silencio.
    plainLyricsInput.addEventListener('input', (event) => {
      const text = event.target.value;
      state.editorLines = preserveChords(buildEditorLines(text), state.editorLines);
      state.plainLyricsText = text;
      notifyChange();
    });

    container.querySelector('#bold-lyrics-btn').addEventListener('click', () => wrapSelectionInBold(plainLyricsInput));

    container.querySelector('#expand-lyrics-btn').addEventListener('click', () => {
      openFullscreenTextEditor({
        title: 'Letra',
        initialValue: plainLyricsInput.value,
        placeholder: plainLyricsInput.placeholder,
        onSave: (value) => {
          plainLyricsInput.value = value;
          plainLyricsInput.dispatchEvent(new Event('input', { bubbles: true }));
        },
      });
    });

    container.querySelector('#go-chords-btn').addEventListener('click', () => {
      state.phase = 'chords';
      render();
      notifyChange();
    });
  }

  // El principio de cada palabra de toda la letra, en orden — a dónde salta
  // Tab / Shift+Tab. Cruza de línea solo.
  function anclasDePalabras() {
    const anclas = [];
    state.editorLines.forEach((line, lineIndex) => {
      if (line.type !== 'lyric') return;
      line.words.forEach((word) => anclas.push({ lineIndex, index: word.start }));
    });
    return anclas;
  }

  // Abre el cuadrito para poner (o cambiar) el acorde que va ANTES de la
  // letra `index` de la línea. `chordRef` es el acorde que se está editando
  // (si ya existe), para no confundirlo con otro en la misma letra.
  function abrirEnPosicion(lineIndex, index, chordRef) {
    const line = state.editorLines[lineIndex];
    const lineEl = container.querySelector(`[data-lyric-line="${lineIndex}"]`);
    if (!line || !lineEl) return;
    const charEls = lineEl.querySelectorAll('.ce-char');
    const anchorEl = charEls[Math.min(index, charEls.length - 1)];
    anchorEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const existing = chordRef || line.chords.find((c) => c.index === index);

    openChordPopover(anchorEl, { entry: existing }, {
      onSubmit(newChord) {
        if (newChord) {
          if (existing) existing.chord = newChord;
          else line.chords.push({ index, chord: newChord });
        } else if (existing) {
          line.chords.splice(line.chords.indexOf(existing), 1);
        }
        rerenderPreservingScroll();
        notifyChange();
      },
      // Tab (o Shift+Tab): confirma el acorde tipeado, como si se tocara
      // "Guardar", y de paso abre el de la palabra siguiente (o anterior) —
      // para cargar una canción entera de corrido con el teclado, sin soltar
      // el mouse en cada palabra.
      onTab(direction) {
        const actual = existing ? existing.index : index;
        const anclas = anclasDePalabras();
        const destino =
          direction > 0
            ? anclas.find((a) => a.lineIndex > lineIndex || (a.lineIndex === lineIndex && a.index > actual))
            : [...anclas].reverse().find((a) => a.lineIndex < lineIndex || (a.lineIndex === lineIndex && a.index < actual));
        if (destino) abrirEnPosicion(destino.lineIndex, destino.index);
      },
    });
  }

  // Una línea de letra: la letra queda BLOQUEADA (no se toca, para eso está
  // "Editar letra") y toda la interacción pasa en la franja de arriba — un
  // toque pone un acorde en la letra que queda justo debajo de ese punto, y
  // se arrastra con el dedo para correrlo.
  function wireLyricLine(lineEl) {
    const lineIndex = Number(lineEl.dataset.lyricLine);
    const line = state.editorLines[lineIndex];
    const strip = lineEl.querySelector('.ce-strip');
    const charEls = Array.from(lineEl.querySelectorAll('.ce-char'));

    function leftOfIndex(index) {
      if (index >= charEls.length) {
        const last = charEls[charEls.length - 1];
        return last.offsetLeft + last.offsetWidth;
      }
      return charEls[index].offsetLeft;
    }

    // La letra que está bajo la posición `clientX` (o el final de la línea
    // si cae después de la última). Un espacio no es un lugar válido para un
    // acorde: se pasa a la primera letra de la palabra que sigue.
    function indexFromClientX(clientX) {
      for (let i = 0; i < charEls.length; i++) {
        if (clientX < charEls[i].getBoundingClientRect().right) {
          let index = i;
          while (index < line.text.length && line.text[index] === ' ') index += 1;
          return index;
        }
      }
      return line.text.length;
    }

    // Cada acorde va arriba de su letra; si dos quedan tan cerca que se
    // taparían, el de la derecha se corre un poco (solo se ve así — su
    // posición real, la letra, no cambia).
    function positionChips() {
      let minLeft = 0;
      const chips = Array.from(strip.querySelectorAll('.ce-chip')).sort(
        (a, b) => Number(a.dataset.index) - Number(b.dataset.index)
      );
      for (const chip of chips) {
        const left = Math.max(leftOfIndex(Number(chip.dataset.index)), minLeft);
        chip.style.left = `${left}px`;
        minLeft = left + chip.offsetWidth + 4;
      }
    }
    positionChips();

    function marcarDestino(index) {
      charEls.forEach((el) => el.classList.remove('ce-char-target'));
      if (index !== null && charEls[index]) charEls[index].classList.add('ce-char-target');
    }

    strip.addEventListener('click', (event) => {
      if (event.target !== strip) return;
      abrirEnPosicion(lineIndex, indexFromClientX(event.clientX));
    });

    strip.querySelectorAll('.ce-chip').forEach((chip) => {
      const chord = line.chords[Number(chip.dataset.chordIdx)];
      let drag = null;

      chip.addEventListener('pointerdown', (event) => {
        if (event.button) return;
        chip.setPointerCapture(event.pointerId);
        drag = {
          startX: event.clientX,
          grabDx: event.clientX - chip.getBoundingClientRect().left,
          moved: false,
          index: chord.index,
        };
      });

      chip.addEventListener('pointermove', (event) => {
        if (!drag) return;
        if (!drag.moved && Math.abs(event.clientX - drag.startX) < 6) return;
        drag.moved = true;
        chip.classList.add('dragging');
        chip.style.left = `${event.clientX - drag.grabDx - strip.getBoundingClientRect().left}px`;
        // El acorde queda en la letra que está bajo su borde izquierdo.
        drag.index = indexFromClientX(event.clientX - drag.grabDx + 2);
        marcarDestino(drag.index);
      });

      chip.addEventListener('pointerup', (event) => {
        if (!drag) return;
        const { moved, index } = drag;
        drag = null;
        chip.releasePointerCapture(event.pointerId);
        marcarDestino(null);
        if (moved) {
          chord.index = index;
          rerenderPreservingScroll();
          notifyChange();
        } else {
          abrirEnPosicion(lineIndex, chord.index, chord);
        }
      });

      chip.addEventListener('pointercancel', () => {
        drag = null;
        chip.classList.remove('dragging');
        marcarDestino(null);
        positionChips();
      });
    });
  }

  function renderChordsPhase() {
    container.innerHTML = `
      <p class="chord-editor-hint">
        Tocá la franja de arriba de la línea, justo encima de la letra donde va
        el acorde. Para correrlo, arrastralo con el dedo. La letra no se toca
        acá: para cambiarla, usá "Editar letra".
      </p>
      <div class="chord-editor-lines">
        ${state.editorLines.map((line, lineIndex) => renderLine(line, lineIndex)).join('')}
      </div>
      <div class="form-actions">
        <button type="button" class="btn" id="back-to-lyrics-btn">← Editar letra</button>
      </div>
    `;

    container.querySelector('#back-to-lyrics-btn').addEventListener('click', () => {
      state.phase = 'lyrics';
      render();
    });

    container.querySelectorAll('[data-lyric-line]').forEach(wireLyricLine);

    container.querySelectorAll('[data-instrumental-chord]').forEach((el) => {
      el.addEventListener('click', () => {
        const lineIndex = Number(el.dataset.lineIndex);
        const chordIndex = Number(el.dataset.chordIndex);
        const line = state.editorLines[lineIndex];
        openChordPopover(el, { entry: { chord: line.chords[chordIndex] } }, {
          onSubmit(newChord) {
            if (newChord) line.chords[chordIndex] = newChord;
            else line.chords.splice(chordIndex, 1);
            rerenderPreservingScroll();
            notifyChange();
          },
        });
      });
    });

    container.querySelectorAll('[data-add-instrumental]').forEach((el) => {
      el.addEventListener('click', () => {
        const lineIndex = Number(el.dataset.addInstrumental);
        const line = state.editorLines[lineIndex];
        openChordPopover(el, {}, {
          onSubmit(newChord) {
            if (newChord) line.chords.push(newChord);
            rerenderPreservingScroll();
            notifyChange();
          },
        });
      });
    });
  }

  render();
  notifyChange();
}

function renderLine(line, lineIndex) {
  if (line.type === 'instrumental') {
    return `
      <div class="chord-editor-line chord-editor-instrumental">
        ${line.chords
          .map(
            (chord, chordIndex) => `
          <button type="button" class="chord-editor-chord" data-instrumental-chord
            data-line-index="${lineIndex}" data-chord-index="${chordIndex}">${escapeHtml(chord)}</button>`
          )
          .join('')}
        <button type="button" class="chord-editor-add" data-add-instrumental="${lineIndex}">+ acorde</button>
      </div>
    `;
  }

  // Cada letra en su propio <span> pegado al anterior (sin saltos de línea
  // entre medio, o aparecerían espacios de más) para poder saber en qué
  // letra cae un toque; los acordes se posicionan en wireLyricLine.
  const letras = line.text
    .split('')
    .map((ch, i) => `<span class="ce-char" data-i="${i}">${escapeHtml(ch)}</span>`)
    .join('');
  const acordes = line.chords
    .map(
      (c, i) =>
        `<button type="button" class="ce-chip" data-chord-idx="${i}" data-index="${c.index}">${escapeHtml(c.chord)}</button>`
    )
    .join('');
  return `
    <div class="ce-line" data-lyric-line="${lineIndex}">
      <div class="ce-line-inner">
        <div class="ce-strip">${acordes}</div>
        <div class="ce-text">${letras}</div>
      </div>
    </div>
  `;
}

function linesToPlainText(lines) {
  return lines.map((line) => (line.type === 'instrumental' ? '' : line.text)).join('\n');
}

// `info` es { entry } con el acorde actual ({chord, ...}) si ya hay uno.
// `handlers` es { onSubmit(chord), onTab(direction) } — onTab es opcional
// (solo lo pasan los acordes de la letra, no los sueltos de una línea
// instrumental). Para correr un acorde ya no hay botones: se arrastra.
function openChordPopover(anchorEl, { entry }, { onSubmit, onTab }) {
  const currentChord = entry ? entry.chord : '';
  const rect = anchorEl.getBoundingClientRect();

  const backdrop = document.createElement('div');
  backdrop.className = 'chord-popover-backdrop';

  const popover = document.createElement('div');
  popover.className = 'chord-popover chord-editor-popover';
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
  popover.innerHTML = `
    <input type="text" id="chord-popover-input" placeholder="Am, E7, Sol..." value="${escapeAttr(currentChord)}" />
    <div class="chord-popover-actions">
      ${currentChord ? '<button type="button" class="btn btn-danger" id="chord-popover-remove">Quitar</button>' : ''}
      <button type="button" class="btn btn-accent" id="chord-popover-save">Guardar</button>
    </div>
  `;

  function close() {
    backdrop.remove();
    popover.remove();
  }

  backdrop.addEventListener('click', close);
  document.body.appendChild(backdrop);
  document.body.appendChild(popover);

  // Si no entra debajo de la letra (ej. la línea está al pie de la pantalla
  // o el teclado ocupa lugar), se muestra arriba.
  if (rect.bottom + 8 + popover.offsetHeight > window.innerHeight) {
    popover.style.top = `${Math.max(8, rect.top - 8 - popover.offsetHeight)}px`;
  }

  const input = popover.querySelector('#chord-popover-input');
  input.focus();
  input.select();

  function submit() {
    const normalized = normalizeTypedChord(input.value);
    close();
    onSubmit(normalized);
  }

  popover.querySelector('#chord-popover-save').addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submit();
    } else if (event.key === 'Escape') {
      close();
    } else if (event.key === 'Tab' && onTab) {
      // preventDefault a propósito: en vez de que el navegador mueva el
      // foco a "lo que sea que venga después" en el HTML (el botón
      // Guardar, el de abajo de todo...), confirmamos este acorde y
      // abrimos nosotros el popover de la palabra siguiente (o anterior
      // con Shift+Tab) — así se puede cargar toda la canción de corrido
      // sin soltar el teclado ni tocar el mouse.
      event.preventDefault();
      const normalized = normalizeTypedChord(input.value);
      close();
      onSubmit(normalized);
      onTab(event.shiftKey ? -1 : 1);
    }
  });

  const removeBtn = popover.querySelector('#chord-popover-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      close();
      onSubmit('');
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
