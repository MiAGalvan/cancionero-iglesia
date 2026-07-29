// Dibuja un teclado de una octava y resalta las teclas de las notas del
// acorde. No usamos ninguna librería para esto: es más simple dibujar el
// SVG a mano que sumar una dependencia para siete rectángulos y cinco negras.
// Las notas se calculan con la misma teoría musical que usa el diagrama de
// guitarra (chordTheory.js), así los dos instrumentos siempre coinciden.
import { parseChordName, chordTones } from './chordTheory.js';

// chordTones puede devolver la nota con bemol (Eb, Ab, Bb...); acá el teclado
// solo tiene un nombre por tecla negra, así que normalizamos al sostenido.
const NOTE_ALIASES = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Teclas negras: van después de la tecla blanca de este índice (no hay negra
// entre Mi-Fa ni entre Si-Do).
const BLACK_NOTES = [
  { afterWhiteIndex: 0, name: 'C#' },
  { afterWhiteIndex: 1, name: 'D#' },
  { afterWhiteIndex: 3, name: 'F#' },
  { afterWhiteIndex: 4, name: 'G#' },
  { afterWhiteIndex: 5, name: 'A#' },
];

const WHITE_WIDTH = 40;
const WHITE_HEIGHT = 130;
const BLACK_WIDTH = 24;
const BLACK_HEIGHT = 78;

function normalizeNote(note) {
  return NOTE_ALIASES[note] || note;
}

export function renderPianoDiagram(container, chordName) {
  container.innerHTML = '';
  const parsed = parseChordName(chordName);

  if (!parsed) {
    container.textContent = `Sin diagrama para "${chordName}"`;
    return;
  }

  const notesInChord = new Set(chordTones(parsed).map(normalizeNote));
  const totalWidth = WHITE_WIDTH * WHITE_NOTES.length;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${WHITE_HEIGHT}`);
  svg.setAttribute('width', totalWidth);
  svg.setAttribute('height', WHITE_HEIGHT);

  WHITE_NOTES.forEach((note, i) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', i * WHITE_WIDTH);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', WHITE_WIDTH);
    rect.setAttribute('height', WHITE_HEIGHT);
    rect.setAttribute('stroke', '#333');
    rect.setAttribute('fill', notesInChord.has(note) ? '#c9a24b' : '#fff');
    svg.appendChild(rect);
  });

  BLACK_NOTES.forEach(({ afterWhiteIndex, name }) => {
    const x = (afterWhiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', BLACK_WIDTH);
    rect.setAttribute('height', BLACK_HEIGHT);
    rect.setAttribute('fill', notesInChord.has(name) ? '#c9a24b' : '#222');
    svg.appendChild(rect);
  });

  container.appendChild(svg);
}
