// Consulta a demanda las lecturas de UNA fecha (hoy o futura, hasta donde
// Vatican News las tenga publicadas) — pensado para que el equipo pueda
// preparar los cantos con anticipación, no para publicar nada solo.
//
// Es una fuente DISTINTA de la que usa sync-lecturas.js: ese trabajo de
// madrugada usa el feed de evangelizo.org (completo — trae Salmo y
// reflexión — pero con muy poca anticipación, a veces ni el día de mañana
// está todavía). Vatican News, en cambio, publica con semanas de
// anticipación, pero no tiene el Salmo. Por eso conviven las dos: una para
// publicar automático "lo de hoy" todos los días, otra para consultar "qué
// va a tocar" bastante más adelante.
//
// Sin CORS propio: esta página se llama desde el navegador de OTRO
// proyecto (app-equipo), así que hace falta agregar el header a mano —
// es una consulta de solo lectura sobre datos públicos, no hace falta
// ninguna clave ni CRON_SECRET.
//
// Nota: esto lee el HTML de una página pensada para que la lea una
// persona, no una API — si Vatican News rediseña esa página, este parseo
// se puede romper y va a hacer falta ajustarlo. No afecta para nada a la
// publicación automática de todos los días (esa sigue usando el feed de
// evangelizo.org, sin relación con este archivo).

function decodeEntities(text) {
  return (text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&oacute;/g, 'ó')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&aacute;/g, 'á')
    .replace(/&uacute;/g, 'ú')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&iquest;/g, '¿')
    .replace(/&iexcl;/g, '¡')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&hellip;/g, '…')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extraerLecturas(html) {
  const sinScripts = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const texto = decodeEntities(sinScripts.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

  const idxLectura = texto.indexOf('Lectura del Día');
  const idxEvangelio = texto.indexOf('Evangelio del Día');
  if (idxLectura === -1 || idxEvangelio === -1) return null;

  const idxSegunda = texto.indexOf('Segunda lectura');
  const idxPapas = texto.indexOf('Las palabras de los Papas');

  const finPrimera = idxSegunda !== -1 && idxSegunda < idxEvangelio ? idxSegunda : idxEvangelio;
  // El trim() va ANTES de sacar la etiqueta "Primera lectura": en domingo
  // esa etiqueta viene con un espacio adelante (que trim() saca primero),
  // así que si el replace corriera antes de trim() el ^ nunca matcheaba y
  // la etiqueta quedaba pegada al principio del texto.
  const primeraLectura = texto
    .slice(idxLectura + 'Lectura del Día'.length, finPrimera)
    .trim()
    .replace(/^Primera lectura\s*/, '');

  const segundaLectura =
    idxSegunda !== -1 && idxSegunda < idxEvangelio
      ? texto.slice(idxSegunda + 'Segunda lectura'.length, idxEvangelio).trim()
      : null;

  const finEvangelio = idxPapas !== -1 ? idxPapas : idxEvangelio + 3000;
  const evangelio = texto.slice(idxEvangelio + 'Evangelio del Día'.length, finEvangelio).trim();

  // La reflexión no siempre está (algunos días no traen comentario). No hay
  // un marcador de cierre confiable, así que se corta en un largo
  // razonable — pero antes se prueba con el texto legal fijo que Vatican
  // News pone después del comentario ("Su contribución a una gran
  // misión..."), si aparece, para no arrastrar ese aviso como si fuera
  // parte de la reflexión.
  let reflexion = null;
  if (idxPapas !== -1) {
    const bloque = texto.slice(idxPapas + 'Las palabras de los Papas'.length, idxPapas + 2500);
    const idxAviso = bloque.indexOf('Su contribución a una gran misión');
    reflexion = (idxAviso !== -1 ? bloque.slice(0, idxAviso) : bloque.slice(0, 2000)).trim();
  }

  // "Fecha DD/MM/YYYY <Nombre del día litúrgico>" — informativo, para
  // mostrar arriba de las lecturas (ej. "Sábado de la XXII semana...").
  const tituloMatch = texto.match(/Fecha \d{2}\/\d{2}\/\d{4}\s*([^.]*?)(?:La Palabra del día es)/);
  const tituloDia = tituloMatch ? tituloMatch[1].trim() : null;

  return { primeraLectura, segundaLectura, evangelio, reflexion, tituloDia };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ ok: false, error: 'Falta ?fecha=YYYY-MM-DD' });
    return;
  }
  const [anio, mes, dia] = fecha.split('-');

  try {
    const url = `https://www.vaticannews.va/es/evangelio-de-hoy/${anio}/${mes}/${dia}.html`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    const html = await respuesta.text();
    const lecturas = extraerLecturas(html);
    if (!lecturas) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    res.status(200).json({ ok: true, fecha, ...lecturas });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
};
