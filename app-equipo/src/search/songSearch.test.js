// Correr con: node src/search/songSearch.test.js
import { normalizeText, filterSongs } from './songSearch.js';

let failures = 0;

function assertEqual(actual, expected, label) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (same) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label}`);
    console.log(`  esperado: ${JSON.stringify(expected)}`);
    console.log(`  obtenido: ${JSON.stringify(actual)}`);
  }
}

const argentina = {
  id: 1,
  title: 'Argentina con León',
  artist: '',
  tags: ['Patria'],
  chordpro: '{title: Argentina con León}\n[C]Hacia adelante, [G]Argentina hacia adelante\nQue Argentina se levante',
};
const adelante = {
  id: 2,
  title: 'Adelante pueblo',
  artist: 'Coro Juvenil',
  tags: [],
  chordpro: '[Am]Caminemos juntos',
};
const perdon = {
  id: 3,
  title: 'Perdón, oh Dios',
  artist: '',
  tags: ['Cuaresma'],
  chordpro: '[Am]Perdón oh Dios mi Padre',
};
const songs = [adelante, argentina, perdon];
const ids = (query) => filterSongs(songs, query).map((s) => s.id);

assertEqual(normalizeText('  León,  ¡Hacia!  '), 'leon hacia', 'normalizeText saca tildes, puntuación y espacios de más');

assertEqual(ids(''), [2, 1, 3], 'búsqueda vacía devuelve todas en su orden');
assertEqual(ids('leon'), [1], 'sin tilde ni mayúscula encuentra "León"');
assertEqual(ids('argentina leon'), [1], 'varias palabras, todas presentes');
assertEqual(ids('leon argentina'), [1], 'el orden de las palabras no importa');
assertEqual(ids('argentina con'), [1], 'una parte del título alcanza (antes pedía el título exacto)');
assertEqual(ids('que se levante'), [1], 'busca también dentro de la letra');
assertEqual(ids('levan'), [1], 'una palabra a medio escribir también encuentra');
assertEqual(ids('hacia'), [1], 'los acordes y directivas no se mezclan con la letra');
assertEqual(ids('coro juvenil'), [2], 'busca por artista');
assertEqual(ids('cuaresma'), [3], 'busca por etiqueta');
assertEqual(ids('title'), [], 'una directiva de ChordPro no cuenta como letra');
assertEqual(ids('zzz'), [], 'sin coincidencias devuelve vacío');
assertEqual(ids('argentina camino'), [], 'si falta una palabra en la misma canción, no coincide');

// Relevancia: título antes que letra.
const soloLetra = { id: 4, title: 'Himno', artist: '', tags: [], chordpro: 'Adelante siempre adelante' };
assertEqual(
  filterSongs([soloLetra, adelante], 'adelante').map((s) => s.id),
  [2, 4],
  'lo que coincide en el título va antes que lo que solo está en la letra'
);

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
