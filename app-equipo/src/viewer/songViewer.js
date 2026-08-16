// Renderiza una canción en ChordPro como HTML (letra + acordes arriba de cada
// sílaba) usando chordsheetjs, y sabe transponerla sin tocar el texto original.
import { ChordProParser, HtmlDivFormatter, ChordLyricsPair } from 'chordsheetjs';

const parser = new ChordProParser();
const formatter = new HtmlDivFormatter();

// Parsea el texto ChordPro guardado en la base de datos a un objeto Song.
// Nunca mutamos este Song "base": cada transposición genera una copia nueva
// (song.transpose devuelve un Song transpuesto, no modifica el original).
export function parseChordPro(chordProText) {
  return parser.parse(chordProText);
}

// Fuerza todos los acordes de la canción a un cifrado en particular —
// "symbol" (americano: C, D, E...) o "solfege" (europeo/latino: Do, Re,
// Mi...) — sin importar en cuál se hayan tipeado originalmente. chordsheetjs
// ya sabe convertir entre los dos (son el mismo acorde, solo cambia cómo se
// nombra), así que esto no afecta la transposición ni el sonido, solo cómo
// se ve el nombre.
function convertNotation(song, notation) {
  if (notation !== 'symbol' && notation !== 'solfege') return song;
  // chordsheetjs pide una tonalidad de referencia para convertir (afecta solo
  // si usa sostenidos o bemoles al elegir el nombre, no cambia el acorde en
  // sí) — usamos la de la canción si la tiene, o 'C' como neutra si no.
  const referenceKey = song.key || 'C';
  return song.mapItems((item) => {
    if (!(item instanceof ChordLyricsPair) || !item.chords) return item;
    return item.changeChord((chord) =>
      notation === 'solfege' ? chord.toChordSolfege(referenceKey) : chord.toChordSymbol(referenceKey)
    );
  });
}

// Devuelve el HTML listo para insertar en el DOM, con la canción transpuesta
// `semitones` semitonos respecto a su tonalidad original (0 = sin cambios) y
// en el cifrado pedido ('symbol' | 'solfege').
export function renderSong(song, semitones = 0, notation = 'symbol') {
  const transposed = semitones === 0 ? song : song.transpose(semitones);
  return formatter.format(convertNotation(transposed, notation));
}
