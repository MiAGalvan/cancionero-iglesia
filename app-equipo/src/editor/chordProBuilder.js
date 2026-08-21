// Lógica pura del editor visual de acordes: acá el guitarrista escribe la
// letra a mano (sin acordes) y después va tocando cada palabra para ponerle
// el acorde que corresponde arriba. Es un camino distinto al de
// parser/chordProParser.js (que interpreta una letra ya pegada de una web,
// con los acordes alineados arriba en su propia línea).
//
// Una línea SIN ninguna palabra (vacía) se trata como línea instrumental:
// ahí van acordes sueltos, sin letra debajo (para una intro o un interludio).
import { normalizeChordCase } from '../parser/chordProParser.js';

// Encuentra cada palabra de una línea y en qué posición (índice de
// carácter) empieza. Sirve tanto para mostrar las palabras como botones
// clickeables como para saber dónde insertar el acorde en el texto final.
export function tokenizeWords(line) {
  const words = [];
  for (const match of line.matchAll(/\S+/g)) {
    words.push({ start: match.index, text: match[0] });
  }
  return words;
}

// El editor no necesita preservar espaciado exacto (eso es cosa de la letra
// pegada de una web, ya alineada); acá alcanza con una palabra separada de
// la otra por un solo espacio. Reconstruimos el texto de la línea a partir
// de las palabras, así el texto siempre coincide con lo que se ve en pantalla.
function normalizedLineFromWords(words) {
  let text = '';
  const normalized = [];
  for (const word of words) {
    if (text.length > 0) text += ' ';
    const start = text.length; // recién acá, después de sumar el separador
    text += word.text;
    normalized.push({ start, text: word.text });
  }
  return { text, words: normalized };
}

// Letra plana (recién escrita, sin ningún acorde todavía) -> estructura
// interna del editor: una entrada por línea.
export function buildEditorLines(plainLyrics) {
  return plainLyrics.split('\n').map((rawLine) => {
    const rawWords = tokenizeWords(rawLine);
    if (rawWords.length === 0) {
      return { type: 'instrumental', chords: [] };
    }
    const { text, words } = normalizedLineFromWords(rawWords);
    // chords: { [wordStart]: { chord: 'Am', offset: 0 } }. El acorde queda
    // "enganchado" a una palabra (así siempre sabemos a qué botón
    // corresponde), pero `offset` permite correrlo unas letras adentro de
    // esa palabra cuando el acorde no va justo al principio (depende de la
    // melodía). offset 0 = arriba del todo, como antes.
    return { type: 'lyric', text, words, chords: {} };
  });
}

// Un acorde puede correrse desde el principio de su palabra (offset 0) hasta
// la anteúltima letra (offset length-1): nunca lo dejamos pasar de largo,
// para que siga siendo inequívoco a qué palabra pertenece el botón.
export function clampChordOffset(offset, wordLength) {
  return Math.max(0, Math.min(offset, wordLength - 1));
}

// Separa una línea de ChordPro en su letra sin acordes y la posición (ya en
// esa letra sin acordes) donde iba cada uno. Es la operación inversa de
// "insertar el acorde ahí" — por eso permite cargar una canción ya guardada
// y seguir editándola de forma visual.
function extractChordPlacements(chordproLine) {
  const placements = [];
  let plain = '';
  let i = 0;
  while (i < chordproLine.length) {
    if (chordproLine[i] === '[') {
      const end = chordproLine.indexOf(']', i);
      if (end === -1) {
        plain += chordproLine[i];
        i += 1;
        continue;
      }
      placements.push({ index: plain.length, chord: chordproLine.slice(i + 1, end) });
      i = end + 1;
    } else {
      plain += chordproLine[i];
      i += 1;
    }
  }
  return { plain, placements };
}

// El editor siempre engancha el botón de un acorde a una palabra completa
// (nunca a una letra suelta): si un acorde cae a mitad de una palabra (algo
// común según la melodía), se engancha a esa misma palabra, guardando
// cuántas letras adentro va (ver clampChordOffset). No cambia nada al
// cantar, solo a qué palabra queda "atado" el botón en este editor.
function wordAtOrBefore(words, index) {
  let found = null;
  for (const word of words) {
    if (word.start <= index) found = word;
    else break;
  }
  return found || words[0];
}

// ChordPro existente -> estructura interna del editor, con los acordes que
// ya tenía puestos en su lugar.
export function chordProToEditorLines(chordpro) {
  const rawLines = chordpro
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*\{.*\}\s*$/.test(line)); // saca líneas que son solo una directiva, ej {title: ...}

  return rawLines.map((rawLine) => {
    const { plain, placements } = extractChordPlacements(rawLine);
    const rawWords = tokenizeWords(plain);

    if (rawWords.length === 0) {
      return { type: 'instrumental', chords: placements.map((p) => p.chord) };
    }

    const { text, words } = normalizedLineFromWords(rawWords);
    const chords = {};
    for (const { index, chord } of placements) {
      const word = wordAtOrBefore(rawWords, index);
      const normalizedWord = words[rawWords.indexOf(word)];
      const offset = clampChordOffset(index - word.start, normalizedWord.text.length);
      chords[normalizedWord.start] = { chord, offset };
    }
    return { type: 'lyric', text, words, chords };
  });
}

// Estructura interna del editor -> texto ChordPro final, listo para guardar.
// Por cada línea, inserta "[acorde]" justo antes de cada palabra que tenga
// uno asignado; en una línea instrumental, deja los acordes sueltos uno
// detrás del otro.
export function editorLinesToChordPro(editorLines) {
  return editorLines
    .map((line) => {
      if (line.type === 'instrumental') {
        return line.chords.map((chord) => `[${chord}]`).join(' ');
      }

      const entries = Object.entries(line.chords)
        .map(([wordStart, { chord, offset }]) => ({ start: Number(wordStart) + offset, chord }))
        .sort((a, b) => a.start - b.start);

      let result = line.text;
      let offset = 0;
      for (const { start, chord } of entries) {
        const insertAt = start + offset;
        const bracketed = `[${chord}]`;
        result = result.slice(0, insertAt) + bracketed + result.slice(insertAt);
        offset += bracketed.length;
      }
      return result;
    })
    .join('\n');
}

// Al volver a "Editar letra" (o al tipear ahí, ver chordEditorWidget.js) el
// texto se vuelve a partir en líneas desde cero. Antes esta función
// comparaba la lista nueva contra la vieja LÍNEA A LÍNEA por posición
// (índice 0 contra índice 0, índice 1 contra índice 1...) — así que sacar o
// agregar una sola línea en el medio (ej. quitar un interlineado de más)
// corría el índice de todo lo que venía después, y como ya no coincidían
// línea a línea, se perdían TODOS los acordes de ahí en adelante, aunque
// esas líneas no hubieran cambiado ni una letra.
//
// Ahora se empareja por CONTENIDO en vez de por posición: cada línea vieja
// queda disponible para cualquier línea nueva con el mismo texto (se elige
// la más cercana en posición, por si el mismo verso se repite más de una
// vez en la canción, ej. un estribillo). Una línea instrumental (en
// blanco) no tiene texto para comparar, así que se empareja por cercanía
// de posición entre todas las instrumentales disponibles.
export function preserveChords(newLines, oldLines) {
  const disponiblesPorTexto = new Map();
  const disponiblesInstrumental = [];
  oldLines.forEach((old, index) => {
    if (old.type === 'instrumental') {
      disponiblesInstrumental.push({ index, chords: old.chords });
      return;
    }
    if (!disponiblesPorTexto.has(old.text)) disponiblesPorTexto.set(old.text, []);
    disponiblesPorTexto.get(old.text).push({ index, chords: old.chords });
  });

  function sacarMasCercano(candidatos, posicion) {
    let mejor = 0;
    for (let i = 1; i < candidatos.length; i++) {
      if (Math.abs(candidatos[i].index - posicion) < Math.abs(candidatos[mejor].index - posicion)) {
        mejor = i;
      }
    }
    return candidatos.splice(mejor, 1)[0];
  }

  return newLines.map((line, i) => {
    if (line.type === 'instrumental') {
      if (disponiblesInstrumental.length === 0) return line;
      const elegido = sacarMasCercano(disponiblesInstrumental, i);
      return { ...line, chords: [...elegido.chords] };
    }
    const candidatos = disponiblesPorTexto.get(line.text);
    if (!candidatos || candidatos.length === 0) return line;
    const elegido = sacarMasCercano(candidatos, i);
    return { ...line, chords: { ...elegido.chords } };
  });
}

// Normaliza lo que tipeó el usuario en el popover de un acorde (espacios,
// mayúsculas de notas latinas, y la nota en notación anglosajona por si la
// escribió en minúscula, ej "am" -> "Am") antes de guardarlo. Devuelve ''
// si quedó vacío (o sea: "sacar el acorde de acá"). A diferencia del pegado
// desde una web (que ya viene con las notas en mayúscula), acá el usuario
// tipea a mano y es común que le salga en minúscula sin querer.
export function normalizeTypedChord(rawChord) {
  const trimmed = rawChord.trim();
  if (!trimmed) return '';
  const withUppercaseRoot = trimmed
    .split('/')
    .map((part) => (/^[a-g]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join('/');
  return normalizeChordCase(withUppercaseRoot);
}
