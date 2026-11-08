// Sugerencias de canciones del cancionero para una misa, según lo que se lee
// ese día (antífonas, salmo, lecturas, Evangelio) y el tiempo litúrgico.
//
// A propósito NO usa inteligencia artificial: es una tarea que se repite todas
// las semanas, así que un puntaje fijo alcanza — es gratis, anda sin conexión
// (las lecturas se piden una vez y el resto es local) y para el mismo día
// siempre da el mismo resultado. Son ideas para la persona que arma la lista
// (no elige nada sola) y siempre explica por qué sugiere cada canción.
//
// Cómo puntúa una canción de una categoría (Entrada, Comunión...):
//  1. Palabras en común entre lo que se lee en ese momento y la canción
//     (título, etiquetas y letra). Una palabra vale más cuanto MÁS RARA es en
//     el cancionero: "pastor" o "cordero" distinguen, "Señor" o "Dios" están
//     en casi todas y no distinguen nada. Además de ignorar las palabras
//     vacías ("de", "que", "dijo"...) se comparan por la raíz, así "pastor"
//     encuentra "pastores".
//  2. Tiempo litúrgico: suma si la canción está etiquetada con el de esa
//     semana, y se descarta una de otro tiempo propio (ej. una de Adviento
//     en Pascua). Las canciones sin etiquetas valen para cualquier época.
//  3. Variedad: lo que ya se cantó en las últimas semanas baja de puntaje.

import { normalizeText, lyricsOf } from './songSearch.js';

// De dónde sale el "tema" de cada momento de la misa y cuánto pesa cada
// fuente. Las claves son las de datosLiturgicos.js. El orden de las
// categorías no importa acá.
export const FUENTES_POR_MOMENTO = {
  ENTRADA: [
    ['entrada', 3],
    ['respuesta', 1],
    ['evangelio', 1],
  ],
  OFERTORIO: [
    ['evangelio', 2],
    ['primeraLectura', 2],
    ['segundaLectura', 1],
  ],
  COMUNIÓN: [
    ['comunion', 3],
    ['evangelio', 2],
    ['respuesta', 1],
  ],
  MEDITACIÓN: [
    ['respuesta', 3],
    ['salmo', 1.5],
    ['evangelio', 1.5],
  ],
  SALIDA: [
    ['evangelio', 2],
    ['primeraLectura', 1],
    ['segundaLectura', 1],
  ],
};

export const ETIQUETA_FUENTE = {
  entrada: 'antífona de entrada',
  comunion: 'antífona de comunión',
  respuesta: 'respuesta del salmo',
  salmo: 'salmo',
  evangelio: 'Evangelio',
  primeraLectura: '1ª lectura',
  segundaLectura: '2ª lectura',
};

// Del título que trae misadehoy.org ("Domingo XXXII del Tiempo Ordinario") al
// tiempo litúrgico, con el mismo nombre que las etiquetas de las canciones
// (ver LITURGICAL_TAGS en storage/constants.js). null si no se reconoce, y
// entonces simplemente no se filtra por época.
const TIEMPOS = [
  ['Semana Santa', ['semana santa', 'domingo de ramos', 'jueves santo', 'viernes santo', 'triduo', 'vigilia pascual']],
  ['Adviento', ['adviento']],
  ['Navidad', ['navidad', 'natividad', 'epifania', 'sagrada familia', 'bautismo del senor']],
  ['Cuaresma', ['cuaresma', 'miercoles de ceniza']],
  ['Pentecostés', ['pentecostes']],
  ['Pascua', ['pascua', 'ascension']],
  ['Tiempo Ordinario', ['ordinario']],
];

export function tiempoDesdeTitulo(titulo) {
  const texto = normalizeText(titulo);
  if (!texto) return null;
  for (const [tiempo, claves] of TIEMPOS) {
    if (claves.some((clave) => texto.includes(clave))) return tiempo;
  }
  return null;
}

// Etiquetas que son de UNA época en particular: una canción que tiene
// alguna de estas y ninguna es la de esta semana, no se sugiere.
const TIEMPOS_PROPIOS = ['Adviento', 'Navidad', 'Cuaresma', 'Semana Santa', 'Pascua', 'Pentecostés'];

const BONUS_TIEMPO = 3;
// Peso a partir del cual una fuente se considera "corta" (antífonas y respuesta).
const PESO_FUENTE_CORTA = 3;
const FACTOR_RECIENTE = 0.4;

// Palabras sin contenido (ya sin tildes, como las deja normalizeText).
const PALABRAS_VACIAS = new Set(
  (
    'a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuando de del desde donde dos ' +
    'e el ella ellas ellos en entre era eran eres es esa esas ese eso esos esta estaba estan estar este esto estos fue fueron ha ' +
    'han has hasta hay he hizo la las le les lo los mas me mi mis mucho muchos muy nada ni no nos nosotros o os otra otras otro ' +
    'otros para pero poco por porque que quien quienes se sea ser si sido sin sobre son soy su sus tambien tanto te tenia ti tiene ' +
    'tienen todo todos tras tu tus un una uno unos va vais vamos van vas ve veis ves voy vosotros vuestro y ya yo ' +
    'dice dicen dijo dijeron digo ahi alli ahora entonces luego despues pues tal tan aquel aquella aquellos aquellas ' +
    'cuyo cuya cuyos cuyas hacia mientras segun sino tampoco todavia vez veces ' +
    'amen aleluya gloria dios senor'
  ).split(' ')
);

// Todo en minúsculas, sin tildes y sin puntuación; las palabras muy cortas y
// las vacías no cuentan.
function palabrasDe(texto) {
  return normalizeText(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
}

// Raíz tosca para que "pastor"/"pastores", "perdón"/"perdona"/"perdonar" se
// reconozcan como la misma palabra. Las palabras de hasta 5 letras quedan
// enteras (no hay mucho que recortar y se confundirían entre sí).
export function raizDe(palabra) {
  return palabra.length >= 6 ? palabra.slice(0, 5) : palabra;
}

function raicesDe(texto) {
  return palabrasDe(texto).map((palabra) => ({ palabra, raiz: raizDe(palabra) }));
}

// Qué tan frecuente es cada raíz en el cancionero (en cuántas canciones
// aparece), una sola vez por consulta.
function frecuenciaDeRaices(songs) {
  const documentos = new Map();
  const perfiles = new Map();
  for (const song of songs) {
    const titulo = new Set(raicesDe([song.title, ...(song.tags || [])].join(' ')).map((r) => r.raiz));
    const todas = new Set([...titulo, ...raicesDe(lyricsOf(song.chordpro)).map((r) => r.raiz)]);
    perfiles.set(song, { titulo, todas });
    for (const raiz of todas) documentos.set(raiz, (documentos.get(raiz) || 0) + 1);
  }
  return { documentos, perfiles };
}

// El "tema" de un momento: raíz -> { peso, palabra (como aparece en la
// lectura), fuente }. Una raíz que se repite en varias fuentes suma, pero
// con rendimientos decrecientes (log) para que un texto largo no tape al resto.
function temaDeMomento(momento, fuentes) {
  const config = FUENTES_POR_MOMENTO[momento] || [];
  const tema = new Map();
  for (const [clave, pesoFuente] of config) {
    const texto = fuentes?.[clave];
    if (!texto) continue;
    const conteo = new Map();
    for (const { palabra, raiz } of raicesDe(texto)) {
      const previo = conteo.get(raiz);
      conteo.set(raiz, { palabra: previo?.palabra || palabra, veces: (previo?.veces || 0) + 1 });
    }
    for (const [raiz, { palabra, veces }] of conteo) {
      const aporte = pesoFuente * (1 + Math.log(veces));
      const actual = tema.get(raiz);
      if (!actual) {
        tema.set(raiz, { peso: aporte, palabra, fuente: clave, pesoFuente, mayor: aporte });
      } else {
        actual.peso += aporte;
        if (aporte > actual.mayor) {
          actual.mayor = aporte;
          actual.fuente = clave;
          actual.pesoFuente = pesoFuente;
        }
      }
    }
  }
  return tema;
}

function esDeOtraEpoca(song, tiempo) {
  if (!tiempo) return false;
  const propias = (song.tags || []).filter((t) => TIEMPOS_PROPIOS.includes(t));
  if (propias.length === 0) return false;
  return !(song.tags || []).includes(tiempo);
}

// Devuelve las `limite` canciones más recomendables de `candidatas` (las de
// UNA categoría) para `momento`, cada una con el motivo.
//
//  - todasLasCanciones: el cancionero completo de la parroquia (para saber
//    qué palabras son comunes y cuáles raras).
//  - fuentes: { entrada, comunion, respuesta, salmo, evangelio, primeraLectura,
//    segundaLectura } con los textos de ese día (los que falten, se ignoran).
//  - tiempo: 'Adviento', 'Cuaresma'... o null si no se pudo saber.
//  - recientes: Set de ids de canciones cantadas hace poco.
export function sugerirCanciones({ momento, candidatas, todasLasCanciones, fuentes, tiempo = null, recientes = new Set(), limite = 4 }) {
  const tema = temaDeMomento(momento, fuentes);
  const { documentos, perfiles } = frecuenciaDeRaices(todasLasCanciones.length ? todasLasCanciones : candidatas);
  const total = Math.max(todasLasCanciones.length, candidatas.length, 1);

  const resultados = [];
  for (const song of candidatas) {
    if (esDeOtraEpoca(song, tiempo)) continue;

    const perfil = perfiles.get(song) || frecuenciaDeRaices([song]).perfiles.get(song);
    const coincidencias = [];
    let puntaje = 0;
    for (const [raiz, info] of tema) {
      if (!perfil.todas.has(raiz)) continue;
      const apariciones = documentos.get(raiz) || 1;
      // Una palabra que está en más de un tercio del cancionero no distingue
      // nada (solo si hay suficientes canciones como para poder afirmarlo).
      if (total >= 12 && apariciones / total > 0.33) continue;
      const rareza = Math.log((total + 1) / (apariciones + 0.5));
      const enTitulo = perfil.titulo.has(raiz);
      const aporte = info.peso * rareza * (enTitulo ? 2 : 1);
      puntaje += aporte;
      coincidencias.push({ palabra: info.palabra, fuente: info.fuente, aporte, enTitulo, pesoFuente: info.pesoFuente });
    }
    // Las letras largas tienen más palabras distintas y por eso más
    // chances de coincidir: se compensa un poco.
    puntaje /= Math.sqrt(Math.max(perfil.todas.size, 20) / 20);

    const esDelTiempo = Boolean(tiempo) && (song.tags || []).includes(tiempo);
    if (esDelTiempo) puntaje += BONUS_TIEMPO;

    // Una palabra suelta de una lectura larga no alcanza para sugerir nada
    // (es casualidad): hace falta más de una palabra en común, o que esté en
    // el título, o que venga de la antífona / la respuesta del salmo, que son
    // cortas y dicen de qué va ese momento.
    const coincidenciaSolida =
      coincidencias.length >= 2 || coincidencias.some((c) => c.enTitulo || c.pesoFuente >= PESO_FUENTE_CORTA);
    // Sin coincidencia sólida, solo entra si es de una época propia de esta
    // semana (Adviento, Cuaresma...). "Tiempo Ordinario" no cuenta: es la
    // etiqueta de la mayoría de las canciones y no dice nada del día.
    const entraSoloPorEpoca = esDelTiempo && TIEMPOS_PROPIOS.includes(tiempo);
    if (!coincidenciaSolida && !entraSoloPorEpoca) continue;

    const esReciente = recientes.has(song.id);
    if (esReciente) puntaje *= FACTOR_RECIENTE;

    coincidencias.sort((a, b) => b.aporte - a.aporte);
    resultados.push({
      song,
      puntaje,
      palabras: coincidencias.slice(0, 3).map((c) => ({ palabra: c.palabra, fuente: c.fuente, enTitulo: c.enTitulo })),
      esDelTiempo,
      esReciente,
    });
  }

  resultados.sort((a, b) => b.puntaje - a.puntaje || a.song.title.localeCompare(b.song.title, 'es'));
  return resultados.slice(0, limite);
}
