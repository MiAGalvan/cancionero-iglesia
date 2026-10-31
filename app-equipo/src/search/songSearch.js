// Búsqueda del cancionero, compartida por todas las pantallas que buscan
// canciones (biblioteca, carpetas, armar lista de misa, compartidas).
//
// Antes cada pantalla hacía `title.includes(texto)` por su cuenta: había que
// escribir el título exacto, con sus tildes y en ese orden (ej. "Argentina
// con León" no aparecía buscando "leon argentina", ni buscando una frase de
// la letra). Ahora:
//  - se ignoran mayúsculas, tildes y puntuación ("leon" encuentra "León");
//  - lo que se escribe se separa en palabras y TODAS tienen que aparecer,
//    en cualquier orden y en cualquier parte: título, artista, etiquetas o
//    la letra de la canción;
//  - una palabra a medio escribir también cuenta ("adel" encuentra
//    "adelante");
//  - los resultados salen ordenados por relevancia: primero lo que coincide
//    en el título, después artista/etiquetas y al final lo que solo está en
//    la letra.

export function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// La letra sin los acordes ([Am]), las directivas ({title: ...}) ni las
// marcas de negrita, para buscar solo sobre lo que se canta.
function lyricsOf(chordpro) {
  return String(chordpro || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/<[^>]*>/g, ' ');
}

// Normalizar la letra de cada canción en cada tecla sería carísimo en un
// cancionero grande: se calcula una vez y se reusa mientras la canción no
// cambie (la clave incluye cuándo se editó por última vez).
const indexCache = new Map();

function indexOf(song) {
  const key = `${song.uuid || song.id}|${song.updatedAt || ''}|${(song.chordpro || '').length}`;
  let entry = indexCache.get(key);
  if (!entry) {
    entry = {
      title: normalizeText(song.title),
      secondary: normalizeText([song.artist, ...(song.tags || [])].join(' ')),
      lyrics: normalizeText(lyricsOf(song.chordpro)),
    };
    indexCache.set(key, entry);
  }
  return entry;
}

// 0 = no coincide. Mayor = más relevante.
function scoreSong(song, words, phrase) {
  const { title, secondary, lyrics } = indexOf(song);
  let score = 0;
  for (const word of words) {
    let wordScore = 0;
    if (title.includes(word)) {
      // Que sea el comienzo de una palabra del título vale más que estar
      // metida a la mitad de otra.
      wordScore = title.startsWith(word) || title.includes(` ${word}`) ? 6 : 4;
    } else if (secondary.includes(word)) {
      wordScore = 3;
    } else if (lyrics.includes(word)) {
      wordScore = 1;
    }
    if (wordScore === 0) return 0;
    score += wordScore;
  }
  if (title.includes(phrase)) score += 5; // la frase entera seguida en el título
  return score;
}

// Devuelve las canciones que coinciden con `query`, de la más a la menos
// relevante (a igual relevancia queda el orden que ya traían, ej. por
// título). Con la búsqueda vacía devuelve todas, sin tocar el orden.
export function filterSongs(songs, query) {
  const phrase = normalizeText(query);
  if (!phrase) return songs;
  const words = phrase.split(' ');
  return songs
    .map((song, position) => ({ song, position, score: scoreSong(song, words, phrase) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map((item) => item.song);
}
