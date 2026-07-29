// Convierte texto pegado (letra con acordes arriba, tipo Lacuerda.net) a formato ChordPro,
// que es el formato que entiende la librería chordsheetjs: acordes entre corchetes
// pegados a la sílaba donde van, ej: "Zamba de a[E7]bril".

// Nota del acorde: letras A-G (notación anglosajona) o Do/Re/Mi/Fa/Sol/La/Si
// (notación latina, muy común en sitios de cancioneros en español). Siempre
// en mayúsculas: así "sol", "mi", "la" sueltos en medio de la letra (son
// palabras comunes del español) no se confunden con acordes.
const NOTE = '(?:[A-G]|DO|RE|MI|FA|SOL|LA|SI)';

// Patrón de un acorde suelto: nota + alteración opcional (#/b) + calidad opcional
// (m, maj, min, dim, aug, sus2/4, add9...) + número opcional (7, 9, 11...) + bajo opcional (/E).
// Ejemplos que matchea: Am, G7, C#m, Bb, Dsus4, F#m7, E7/G#, MIm, SOL7, LAm, RE7/SOL
const CHORD_REGEX = new RegExp(
  `^${NOTE}(#|b)?(maj|min|m|dim|aug|sus[24]?|add\\d{1,2})?\\d{0,2}(\\/${NOTE}(#|b)?)?$`
);

// Separadores y anotaciones que a veces aparecen en las líneas de acordes
// copiadas de la web (barras de compás, guiones, "repetir") y no cuentan
// como "no es un acorde" al clasificar la línea.
const IGNORABLE_TOKENS = new Set(['|', '-', '.', '%', 'BIS', 'bis']);

export function isChordToken(token) {
  return CHORD_REGEX.test(token);
}

const LATIN_NOTE_NAMES = ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI'];

// chordsheetjs reconoce las notas latinas solo en "Type Case" (Sol, Mim, Si7):
// si le llega la nota en mayúsculas sueltas (SOL, MIM, SI7 — como suelen venir
// copiadas de la web) rompe al transponer. Bajamos a minúscula todo menos la
// primera letra, tanto en la nota principal como en el bajo de un acorde con
// barra (ej "SOL/SI" -> "Sol/Si"). Los acordes en notación anglosajona (A-G)
// no se tocan, porque no arrancan con ninguno de estos prefijos.
export function normalizeChordCase(token) {
  return token.split('/').map(normalizeNotePart).join('/');
}

function normalizeNotePart(part) {
  const note = LATIN_NOTE_NAMES.find((n) => part.startsWith(n));
  if (!note) return part;
  return note[0] + note.slice(1).toLowerCase() + part.slice(note.length);
}

// Une los tokens (con su posición de columna) de una línea, ignorando espacios.
function tokenize(line) {
  const tokens = [];
  for (const match of line.matchAll(/\S+/g)) {
    tokens.push({ text: match[0], index: match.index });
  }
  return tokens;
}

// Una línea "es de acordes" si, sacando los separadores ignorables, todos sus
// tokens matchean el patrón de acorde y hay al menos uno.
function isChordLine(line) {
  const tokens = tokenize(line).filter((t) => !IGNORABLE_TOKENS.has(t.text));
  if (tokens.length === 0) return false;
  return tokens.every((t) => isChordToken(t.text));
}

// Si el texto pegado ya tiene acordes entre corchetes (ej "[Am]Zamba..."), lo
// tratamos como ChordPro y no lo reprocesamos.
function looksLikeChordPro(text) {
  const bracketChord = new RegExp(`\\[${NOTE}(#|b)?[^\\]]{0,10}\\]`);
  return bracketChord.test(text);
}

// Inserta los acordes de una línea de acordes dentro de la línea de letra siguiente,
// en la columna donde estaba cada acorde. Cada inserción corre el resto de la línea
// hacia la derecha, por eso hay que acumular ese corrimiento (offset).
function mergeChordsIntoLyric(chordLine, lyricLine) {
  const chordTokens = tokenize(chordLine).filter(
    (t) => !IGNORABLE_TOKENS.has(t.text) && isChordToken(t.text)
  );

  let result = lyricLine;
  let offset = 0;
  for (const { text, index } of chordTokens) {
    const insertAt = Math.min(index + offset, result.length);
    const bracketed = `[${normalizeChordCase(text)}]`;
    result = result.slice(0, insertAt) + bracketed + result.slice(insertAt);
    offset += bracketed.length;
  }
  return result;
}

// Una línea de acordes sin letra debajo (intro, interludio) se muestra como
// acordes sueltos entre corchetes, sin texto.
function chordLineAsInstrumental(chordLine) {
  const chordTokens = tokenize(chordLine).filter(
    (t) => !IGNORABLE_TOKENS.has(t.text) && isChordToken(t.text)
  );
  return chordTokens.map((t) => `[${normalizeChordCase(t.text)}]`).join(' ');
}

// Punto de entrada: recibe el texto tal cual se pegó y devuelve texto en ChordPro.
export function pastedTextToChordPro(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (looksLikeChordPro(text)) {
    return text.trim();
  }

  const lines = text.split('\n');
  const outputLines = [];

  // Recorremos con índice manual (no for..of) porque al mergear una línea de
  // acordes con la de letra siguiente, esa línea de letra ya quedó consumida
  // y hay que saltarla en la próxima vuelta.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!isChordLine(line)) {
      outputLines.push(line);
      i += 1;
      continue;
    }

    const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
    const nextIsLyric = nextLine !== null && nextLine.trim() !== '' && !isChordLine(nextLine);

    if (nextIsLyric) {
      outputLines.push(mergeChordsIntoLyric(line, nextLine));
      i += 2;
    } else {
      outputLines.push(chordLineAsInstrumental(line));
      i += 1;
    }
  }

  return outputLines.join('\n').trim();
}
