// Correr con: node src/search/sugerencias.test.js
import { sugerirCanciones, tiempoDesdeTitulo, raizDe } from './sugerencias.js';

let failures = 0;
function check(condition, label, detalle = '') {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label}${detalle ? `\n  ${detalle}` : ''}`);
  }
}

// Cancionero chico, inventado. Muchas canciones nombran al "Señor" (palabra
// que no tiene que distinguir nada); solo una habla del pastor.
let nextId = 1;
const cancion = (title, letra, tags = [], artist = '') => ({
  id: nextId++,
  uuid: `u${nextId}`,
  title,
  artist,
  tags,
  chordpro: `{title: ${title}}\n[C]${letra}`,
});

const songs = [
  cancion('El Señor es mi pastor', 'El Señor es mi pastor nada me falta en verdes praderas me hace descansar'),
  cancion('Gloria al Señor', 'Gloria al Señor que reina por siempre cantemos al Señor con alegría'),
  cancion('Alabaré', 'Alabaré alabaré alabaré a mi Señor con todo el corazón'),
  cancion('Bendito seas Señor', 'Bendito seas Señor por el pan y por el vino fruto de la tierra'),
  cancion('Ven Señor Jesús', 'Ven Señor Jesús no tardes más ven Señor Jesús', ['Adviento']),
  cancion('Pescador de hombres', 'Tú has venido a la orilla no has buscado ni a sabios ni a ricos', ['Envío/Misión']),
  cancion('Perdona a tu pueblo', 'Perdona a tu pueblo Señor perdónanos Señor', ['Cuaresma']),
  cancion('Id y proclamad', 'Id y proclamad la buena noticia a todos los pueblos del mundo'),
  cancion('Un pastor solo', 'Un solo pastor guía a las ovejas por el camino'),
  cancion('Pan del cielo', 'Pan del cielo cuerpo de Cristo alimento de los peregrinos', ['Eucaristía']),
  cancion('Santo es el Señor', 'Santo santo santo es el Señor Dios del universo'),
  cancion('Madre de todos', 'Madre de todos los hombres María ruega por nosotros', ['María']),
];
const [pastor, gloria, alabare, bendito, ven, pescador, perdona, idYProclamad, unPastor, panCielo] = songs;

const ids = (resultados) => resultados.map((r) => r.song.id);

// --- raíces y tiempo litúrgico ---
check(raizDe('pastores') === raizDe('pastor'), 'raizDe: "pastor" y "pastores" comparten raíz');
check(raizDe('perdona') === raizDe('perdón'.normalize('NFD').replace(/\p{M}/gu, '')), 'raizDe: "perdona" y "perdon" comparten raíz');
check(raizDe('luz') === 'luz', 'raizDe: las palabras cortas quedan enteras');

check(tiempoDesdeTitulo('Domingo XXXII del Tiempo Ordinario') === 'Tiempo Ordinario', 'tiempo: Tiempo Ordinario');
check(tiempoDesdeTitulo('3º Domingo de Adviento') === 'Adviento', 'tiempo: Adviento');
check(tiempoDesdeTitulo('Miércoles de Ceniza') === 'Cuaresma', 'tiempo: Miércoles de Ceniza abre la Cuaresma');
check(tiempoDesdeTitulo('Santa Teresa de Ávila') === null, 'tiempo: un título sin época reconocible da null, no se inventa');
check(tiempoDesdeTitulo('Domingo II de Pascua') === 'Pascua', 'tiempo: Pascua');
check(tiempoDesdeTitulo('Vigilia Pascual') === 'Semana Santa', 'tiempo: Vigilia Pascual es Semana Santa, no Pascua');
check(tiempoDesdeTitulo('Domingo de Pentecostés') === 'Pentecostés', 'tiempo: Pentecostés');
check(tiempoDesdeTitulo('') === null && tiempoDesdeTitulo(null) === null, 'tiempo: vacío -> null');

// --- comunión: la antífona habla del pastor y la mesa ---
const comunion = sugerirCanciones({
  momento: 'COMUNIÓN',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { comunion: 'El Señor es mi pastor, nada me falta. Me hace descansar en verdes praderas.' },
});
check(comunion.length > 0 && comunion[0].song.id === pastor.id, 'comunión: primero la que nombra al pastor', JSON.stringify(ids(comunion)));
check(ids(comunion).includes(unPastor.id), 'comunión: "Un pastor solo" también aparece (misma raíz)');
check(!ids(comunion).includes(gloria.id), 'comunión: una canción que solo repite "Señor" no aparece');
check(
  comunion[0].palabras.some((p) => p.palabra === 'pastor' && p.fuente === 'comunion'),
  'comunión: el motivo dice qué palabra coincide y de qué fuente'
);

// --- tiempo litúrgico ---
const enAdviento = sugerirCanciones({
  momento: 'ENTRADA',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { entrada: 'Ven Señor, no tardes más' },
  tiempo: 'Adviento',
});
check(enAdviento[0]?.song.id === ven.id && enAdviento[0].esDelTiempo, 'adviento: la de Adviento es primera y marcada como del tiempo');

const enOrdinario = sugerirCanciones({
  momento: 'ENTRADA',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { entrada: 'Ven Señor, no tardes más. Perdona a tu pueblo' },
  tiempo: 'Tiempo Ordinario',
});
check(!ids(enOrdinario).includes(ven.id) && !ids(enOrdinario).includes(perdona.id), 'ordinario: no se sugieren canciones propias de Adviento ni de Cuaresma');

const sinTiempo = sugerirCanciones({
  momento: 'ENTRADA',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { entrada: 'Perdona a tu pueblo' },
  tiempo: null,
});
check(ids(sinTiempo).includes(perdona.id), 'sin tiempo conocido: no se descarta por época');

// --- solo del tiempo, sin palabras en común ---
const soloTiempo = sugerirCanciones({
  momento: 'SALIDA',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { evangelio: 'Xyzzy quux' },
  tiempo: 'Adviento',
});
check(ids(soloTiempo).join() === String(ven.id), 'sin coincidencias: solo entra la que es explícitamente del tiempo');

// --- variedad: lo que se cantó hace poco baja ---
const conReciente = sugerirCanciones({
  momento: 'COMUNIÓN',
  candidatas: songs,
  todasLasCanciones: songs,
  fuentes: { comunion: 'El Señor es mi pastor, nada me falta' },
  recientes: new Set([pastor.id]),
});
check(conReciente[0]?.song.id === unPastor.id, 'reciente: la que se cantó hace poco pasa a segundo lugar');
check(conReciente.find((r) => r.song.id === pastor.id)?.esReciente === true, 'reciente: queda marcada para avisarlo');

// --- límite y casos vacíos ---
check(
  sugerirCanciones({ momento: 'COMUNIÓN', candidatas: songs, todasLasCanciones: songs, fuentes: { comunion: 'pan cuerpo pastor' }, limite: 2 }).length <= 2,
  'límite: no devuelve más de lo pedido'
);
check(
  sugerirCanciones({ momento: 'COMUNIÓN', candidatas: songs, todasLasCanciones: songs, fuentes: {} }).length === 0,
  'sin textos de la misa: no sugiere nada'
);
check(
  sugerirCanciones({ momento: 'COMUNIÓN', candidatas: [], todasLasCanciones: [], fuentes: { comunion: 'pastor' } }).length === 0,
  'sin canciones en la categoría: lista vacía'
);
check(
  sugerirCanciones({ momento: 'FIESTA', candidatas: songs, todasLasCanciones: songs, fuentes: { comunion: 'pastor' } }).length === 0,
  'momento desconocido: lista vacía'
);

// --- el pan: de la eucaristía ---
const pan = sugerirCanciones({
  momento: 'OFERTORIO',
  candidatas: [bendito, panCielo, idYProclamad, alabare],
  todasLasCanciones: songs,
  fuentes: { evangelio: 'Tomen y coman, esto es mi cuerpo. Tomó el pan y lo bendijo.' },
});
check(ids(pan).includes(panCielo.id) || ids(pan).includes(bendito.id), 'ofertorio: las del pan aparecen para un Evangelio del pan', JSON.stringify(ids(pan)));
check(!ids(pan).includes(idYProclamad.id), 'ofertorio: la que no tiene nada que ver no aparece');

// --- coincidencias flojas no alcanzan ---
const unaPalabraSuelta = sugerirCanciones({
  momento: 'SALIDA',
  candidatas: [pescador, idYProclamad],
  todasLasCanciones: songs,
  fuentes: { evangelio: 'Los que buscan a los sabios en la plaza', primeraLectura: '' },
});
check(unaPalabraSuelta.length === 0 || !ids(unaPalabraSuelta).includes(pescador.id) || unaPalabraSuelta.find((r) => r.song.id === pescador.id).palabras.length >= 2,
  'floja: una sola palabra suelta del Evangelio no alcanza para sugerir');

const ordinarioSolo = sugerirCanciones({
  momento: 'SALIDA',
  candidatas: [cancion('Cantemos todos', 'cantemos todos juntos hoy', ['Tiempo Ordinario'])],
  todasLasCanciones: songs,
  fuentes: { evangelio: 'Xyzzy quux' },
  tiempo: 'Tiempo Ordinario',
});
check(ordinarioSolo.length === 0, 'floja: la etiqueta "Tiempo Ordinario" sola no alcanza (la tienen casi todas)');

const palabraDeAntifona = sugerirCanciones({
  momento: 'COMUNIÓN',
  candidatas: [pastor],
  todasLasCanciones: songs,
  fuentes: { comunion: 'pastor' },
});
check(palabraDeAntifona.length === 1, 'sólida: una sola palabra de la antífona (corta) sí alcanza');

if (failures === 0) {
  console.log('\nTodos los tests pasaron');
} else {
  console.log(`\n${failures} test(s) fallaron`);
  process.exitCode = 1;
}
