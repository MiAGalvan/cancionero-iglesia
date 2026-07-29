// Convierte ChordPro a letra sin acordes: es lo único que se envía a la base
// pública (ver publicar.js). Es un filtro de texto simple a propósito — no
// hace falta trabajo manual ni entender ChordPro para que funcione.
export function chordProToPlainLyrics(chordpro) {
  return chordpro
    .replace(/\[[^\]]*\]/g, '') // saca los acordes: "a[E7]bril" -> "abril"
    .split('\n')
    .filter((line) => !/^\s*\{.*\}\s*$/.test(line)) // saca líneas que son solo una directiva {title: ...}
    .map((line) => line.replace(/\{[^}]*\}/g, '')) // saca directivas sueltas dentro de una línea
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // no dejar más de un renglón en blanco seguido
    .trim();
}
