// Renderiza una canción en ChordPro como HTML (letra + acordes arriba de cada
// sílaba) usando chordsheetjs, y sabe transponerla sin tocar el texto original.
import { ChordProParser, HtmlDivFormatter } from 'chordsheetjs';

const parser = new ChordProParser();
const formatter = new HtmlDivFormatter();

// Parsea el texto ChordPro guardado en la base de datos a un objeto Song.
// Nunca mutamos este Song "base": cada transposición genera una copia nueva
// (song.transpose devuelve un Song transpuesto, no modifica el original).
export function parseChordPro(chordProText) {
  return parser.parse(chordProText);
}

// Devuelve el HTML listo para insertar en el DOM, con la canción transpuesta
// `semitones` semitonos respecto a su tonalidad original (0 = sin cambios).
export function renderSong(song, semitones = 0) {
  const songToRender = semitones === 0 ? song : song.transpose(semitones);
  return formatter.format(songToRender);
}
