// Lee la antífona de entrada y la de comunión del HTML de una fecha de
// eucaristiadiaria.cl (Área de Liturgia y Espiritualidad de la Arquidiócesis
// de Santiago de Chile). Ninguna de las fuentes de lecturas que ya usamos
// (Evangelizo / misadehoy.org) trae las antífonas, y la encargada del coro
// las comparte para dar el sentido de la misa y elegir los cantos de entrada
// y de comunión.
//
// Vive aparte del endpoint (consultar-antifonas.js) para poder probarlo sin
// internet. El prefijo "_" hace que Vercel no lo publique como ruta.
//
// OJO: es el HTML de una página pensada para que la lea una persona, no una
// API: si rediseñan la página, esto puede dejar de encontrar las antífonas
// (en ese caso el endpoint responde "no disponible" y la app simplemente no
// las muestra, sin romper nada más).

const ENTIDADES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  iexcl: '¡',
  iquest: '¿',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};
for (const [base, letras] of Object.entries({ a: 'áÁ', e: 'éÉ', i: 'íÍ', o: 'óÓ', u: 'úÚ' })) {
  ENTIDADES[`${base}acute`] = letras[0];
  ENTIDADES[`${base.toUpperCase()}acute`] = letras[1];
}
ENTIDADES.ntilde = 'ñ';
ENTIDADES.Ntilde = 'Ñ';
ENTIDADES.uuml = 'ü';
ENTIDADES.Uuml = 'Ü';

function decodificar(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (entera, nombre) => (nombre in ENTIDADES ? ENTIDADES[nombre] : entera));
}

// Cada <p> de la página es un párrafo: se junta su texto (sin las marcas de
// color) y se descartan los vacíos.
function parrafosDe(html) {
  const parrafos = [];
  for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const texto = decodificar(match[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (texto) parrafos.push(texto);
  }
  return parrafos;
}

// El título de la antífona trae la cita pegada: "Antífona de entrada Sal
// 129, 3-4" -> referencia "Sal 129, 3-4". Después vienen uno o más párrafos
// con el texto (la de comunión suele sumar un "O bien: ..." con otra opción),
// hasta que empieza lo que sigue en la misa (`finRegex`).
function extraerBloque(parrafos, inicioRegex, finRegex) {
  const desde = parrafos.findIndex((p) => inicioRegex.test(p));
  if (desde === -1) return null;

  const referencia = parrafos[desde].replace(inicioRegex, '').trim();
  const cuerpo = [];
  for (let i = desde + 1; i < parrafos.length && cuerpo.length < 6; i++) {
    if (finRegex.test(parrafos[i])) break;
    cuerpo.push(parrafos[i]);
  }
  const texto = cuerpo.join('\n\n').trim();
  return texto ? { referencia, texto } : null;
}

function extraerAntifonas(html) {
  const parrafos = parrafosDe(html);
  const entrada = extraerBloque(parrafos, /^Antífona de entrada\s*/i, /^(Gloria|ORACI[ÓO]N|Acto penitencial|Se dice)/i);
  const comunion = extraerBloque(parrafos, /^Antífona de comunión\s*/i, /^(ORACI[ÓO]N DESPU[ÉE]S|Contacto|Síguenos)/i);
  if (!entrada && !comunion) return null;
  return { entrada, comunion };
}

module.exports = { extraerAntifonas, decodificar };
