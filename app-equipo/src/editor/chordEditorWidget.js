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
  clampChordOffset,
} from './chordProBuilder.js';

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

  function renderLyricsPhase() {
    container.innerHTML = `
      <p class="chord-editor-hint">
        Escribí la letra, sin acordes. Dejá una línea en blanco donde vaya una
        intro o un interludio (ahí después se pueden poner acordes sueltos).
      </p>
      <textarea id="plain-lyrics-input" rows="10" placeholder="Perdón, oh Dios, mi Padre y Señor...">${escapeHtml(
        state.plainLyricsText
      )}</textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="go-chords-btn">Poner acordes →</button>
      </div>
    `;

    container.querySelector('#go-chords-btn').addEventListener('click', () => {
      const text = container.querySelector('#plain-lyrics-input').value;
      const newLines = preserveChords(buildEditorLines(text), state.editorLines);
      state.editorLines = newLines;
      state.plainLyricsText = text;
      state.phase = 'chords';
      render();
      notifyChange();
    });
  }

  function renderChordsPhase() {
    container.innerHTML = `
      <p class="chord-editor-hint">
        Tocá una palabra para ponerle (o cambiarle) el acorde de arriba. Si no
        va justo al principio, abrí el acorde y usá las flechas para correrlo.
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

    container.querySelectorAll('[data-word-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        const lineIndex = Number(el.dataset.lineIndex);
        const wordStart = Number(el.dataset.wordStart);
        const line = state.editorLines[lineIndex];
        const word = line.words.find((w) => w.start === wordStart);
        const entry = line.chords[wordStart];

        openChordPopover(el, { entry, wordLength: word.text.length }, {
          onSubmit(newChord) {
            if (newChord) {
              const offset = clampChordOffset(entry ? entry.offset : 0, word.text.length);
              line.chords[wordStart] = { chord: newChord, offset };
            } else {
              delete line.chords[wordStart];
            }
            render();
            notifyChange();
          },
          onNudge(direction) {
            const current = line.chords[wordStart];
            if (!current) return;
            const newOffset = clampChordOffset(current.offset + direction, word.text.length);
            line.chords[wordStart] = { ...current, offset: newOffset };
            render();
            notifyChange();
          },
        });
      });
    });

    container.querySelectorAll('[data-instrumental-chord]').forEach((el) => {
      el.addEventListener('click', () => {
        const lineIndex = Number(el.dataset.lineIndex);
        const chordIndex = Number(el.dataset.chordIndex);
        const line = state.editorLines[lineIndex];
        openChordPopover(el, { entry: { chord: line.chords[chordIndex] } }, {
          onSubmit(newChord) {
            if (newChord) line.chords[chordIndex] = newChord;
            else line.chords.splice(chordIndex, 1);
            render();
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
            render();
            notifyChange();
          },
        });
      });
    });
  }

  render();
  notifyChange();
}

// Una palabra sin acorde (o con el acorde justo al principio, offset 0) se
// muestra como un solo bloque. Si el acorde está corrido unas letras adentro
// (offset > 0), partimos la palabra en dos pedacitos visuales justo ahí,
// igual que hace el visor final con el ChordPro ya guardado.
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

  return `
    <div class="chord-editor-line">
      ${line.words.map((word) => renderWordSlot(line, lineIndex, word)).join('')}
    </div>
  `;
}

function renderWordSlot(line, lineIndex, word) {
  const entry = line.chords[word.start];
  const dataAttrs = `data-word-slot data-line-index="${lineIndex}" data-word-start="${word.start}"`;

  if (!entry || entry.offset === 0) {
    return `
      <span class="chord-editor-word" ${dataAttrs}>
        <span class="chord-editor-chord${entry ? '' : ' empty'}">${entry ? escapeHtml(entry.chord) : '+'}</span>
        <span class="chord-editor-text">${escapeHtml(word.text)}</span>
      </span>`;
  }

  const before = word.text.slice(0, entry.offset);
  const after = word.text.slice(entry.offset);
  return `
    <span class="chord-editor-word chord-editor-word-split" ${dataAttrs}
      ><span class="chord-editor-segment">
        <span class="chord-editor-chord"></span>
        <span class="chord-editor-text">${escapeHtml(before)}</span>
      </span><span class="chord-editor-segment">
        <span class="chord-editor-chord">${escapeHtml(entry.chord)}</span>
        <span class="chord-editor-text">${escapeHtml(after)}</span>
      </span></span>`;
}

// Al volver a "Editar letra" y tocar "Poner acordes →" de nuevo, las líneas
// que no cambiaron de texto mantienen los acordes que ya tenían puestos;
// solo se pierden los de la línea que efectivamente se reescribió.
function preserveChords(newLines, oldLines) {
  return newLines.map((line, i) => {
    const old = oldLines[i];
    if (!old || old.type !== line.type) return line;
    if (line.type === 'instrumental') return { ...line, chords: [...old.chords] };
    if (old.text === line.text) return { ...line, chords: { ...old.chords } };
    return line;
  });
}

function linesToPlainText(lines) {
  return lines.map((line) => (line.type === 'instrumental' ? '' : line.text)).join('\n');
}

// `info` es { entry, wordLength } para una palabra ({chord, offset}) o solo
// { entry } (un acorde suelto, sin offset) para una línea instrumental.
// `handlers` es { onSubmit(chord), onNudge(direction) } — onNudge es
// opcional, solo se pasa (y solo se muestran las flechas) cuando tiene
// sentido correr el acorde, es decir sobre una palabra de más de una letra.
function openChordPopover(anchorEl, { entry, wordLength }, { onSubmit, onNudge }) {
  const currentChord = entry ? entry.chord : '';
  const canNudge = Boolean(onNudge && entry && wordLength > 1);
  const rect = anchorEl.getBoundingClientRect();

  const backdrop = document.createElement('div');
  backdrop.className = 'chord-popover-backdrop';

  const popover = document.createElement('div');
  popover.className = 'chord-popover chord-editor-popover';
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
  popover.innerHTML = `
    <input type="text" id="chord-popover-input" placeholder="Am, E7, Sol..." value="${escapeAttr(currentChord)}" />
    ${
      canNudge
        ? `<div class="chord-popover-nudge">
            <span>Mover el acorde:</span>
            <button type="button" class="btn btn-icon" id="chord-popover-nudge-left" title="Correr a la izquierda">◄</button>
            <button type="button" class="btn btn-icon" id="chord-popover-nudge-right" title="Correr a la derecha">►</button>
          </div>`
        : ''
    }
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
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') close();
  });

  const removeBtn = popover.querySelector('#chord-popover-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      close();
      onSubmit('');
    });
  }

  // Las flechas de mover NO cierran el popover: aplican el corrimiento en el
  // fondo (el editor se repinta atrás) y se puede seguir tocando para
  // ajustarlo, viendo el resultado en vivo detrás del popover.
  const nudgeLeft = popover.querySelector('#chord-popover-nudge-left');
  const nudgeRight = popover.querySelector('#chord-popover-nudge-right');
  if (nudgeLeft) nudgeLeft.addEventListener('click', () => onNudge(-1));
  if (nudgeRight) nudgeRight.addEventListener('click', () => onNudge(1));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
