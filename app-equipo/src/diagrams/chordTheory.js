// Traduce un nombre de acorde tal como lo muestra la app ("Am", "F#m",
// "Mim", "Sol7"...) a datos musicales reutilizables: la nota en semitonos
// (0-11) y una "calidad" normalizada (major, minor, 7, m7, sus4...) que se
// usa tanto para buscar en la base de datos de guitarra como para calcular
// las notas del acorde en el piano. Así ambos instrumentos usan la misma
// fuente de verdad y no se pueden desincronizar.
const ENGLISH_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LATIN_SEMITONES = { Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };

// Mismo orden que las "keys" de @tombatossals/chords-db (mezcla sostenidos
// y bemoles según la convención más común para cada nota).
const SEMITONE_TO_KEY = ['C', 'Csharp', 'D', 'Eb', 'E', 'F', 'Fsharp', 'G', 'Ab', 'A', 'Bb', 'B'];
const SEMITONE_TO_NOTE_NAME = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// (calidad + dígitos) -> suffix de chords-db. Cubre las combinaciones que
// puede llegar a producir nuestro propio parser (ver chordProParser.js) más
// alguna variante común si el usuario escribió el ChordPro a mano.
const SUFFIX_MAP = {
  '|': 'major',
  '|6': '6',
  '|69': '69',
  '|7': '7',
  '|9': '9',
  '|11': '11',
  '|13': '13',
  'm|': 'minor',
  'm|6': 'm6',
  'm|69': 'm69',
  'm|7': 'm7',
  'm|9': 'm9',
  'm|11': 'm11',
  'maj|7': 'maj7',
  'maj|9': 'maj9',
  'maj|11': 'maj11',
  'maj|13': 'maj13',
  'dim|': 'dim',
  'dim|7': 'dim7',
  'aug|': 'aug',
  'aug|7': 'aug7',
  'sus|': 'sus4',
  'sus2|': 'sus2',
  'sus4|': 'sus4',
  'sus4|7': '7sus4',
  'add9|': 'add9',
};

// Intervalos en semitonos desde la fundamental, para cada "suffix". Se usan
// para calcular qué teclas resaltar en el piano.
const INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  aug7: [0, 4, 8, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  69: [0, 4, 7, 9, 2],
  m69: [0, 3, 7, 9, 2],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  9: [0, 4, 7, 10, 2],
  m9: [0, 3, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  11: [0, 4, 7, 10, 2, 5],
  m11: [0, 3, 7, 10, 2, 5],
  maj11: [0, 4, 7, 11, 2, 5],
  13: [0, 4, 7, 10, 9],
  maj13: [0, 4, 7, 11, 9],
  add9: [0, 4, 7, 2],
};

// Patrón de un nombre de acorde: nota + alteración opcional + calidad
// opcional + dígitos opcionales. Reconoce tanto "Am"/"F#m7" (anglosajón)
// como "Mim"/"Sol7" (latino, en Type Case). Ignora el bajo de los acordes
// con barra (ej "G/B" busca el diagrama de "G" nomás).
const CHORD_NAME_REGEX =
  /^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])(#|b)?(maj|min|m|dim|aug|sus[24]?|add\d{1,2})?(\d{0,2})$/;

// Devuelve { key, suffix, semitone, noteName } para buscar el acorde en la
// base de guitarra y calcular sus notas de piano, o null si no se reconoce
// (la app entonces muestra "sin diagrama" en vez de romper).
export function parseChordName(chordName) {
  if (!chordName) return null;
  const [main] = chordName.trim().split('/');
  const match = main.match(CHORD_NAME_REGEX);
  if (!match) return null;

  const [, note, accidental, qualityRaw, digits] = match;
  const base = ENGLISH_SEMITONES[note] ?? LATIN_SEMITONES[note];
  if (base === undefined) return null;

  let semitone = base;
  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;
  semitone = ((semitone % 12) + 12) % 12;

  let quality = qualityRaw || '';
  if (quality === 'min') quality = 'm';

  const mapKey = quality.startsWith('add') ? `${quality}|` : `${quality}|${digits || ''}`;
  const suffix = SUFFIX_MAP[mapKey];
  if (!suffix) return null;

  return {
    key: SEMITONE_TO_KEY[semitone],
    suffix,
    semitone,
    noteName: SEMITONE_TO_NOTE_NAME[semitone],
  };
}

// Nombres de las notas del acorde (para el piano), a partir de lo que ya
// calculó parseChordName.
export function chordTones({ semitone, suffix }) {
  const intervals = INTERVALS[suffix] || INTERVALS.major;
  return intervals.map((interval) => SEMITONE_TO_NOTE_NAME[(semitone + interval) % 12]);
}
