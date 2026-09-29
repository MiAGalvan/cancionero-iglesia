// Consulta a demanda las lecturas de UNA fecha (hoy o futura, semanas por
// adelantado) — pensado para que el equipo pueda preparar los cantos con
// anticipación, no para publicar nada solo.
//
// Fuente: misadehoy.org — que a su vez toma las lecturas de Evangelizo.org,
// la MISMA fuente que usa sync-lecturas.js para la publicación automática
// de todos los días (confirmado comparando el resultado de las dos para el
// mismo día: coinciden letra por letra). La diferencia es que misadehoy.org
// arma un calendario litúrgico completo por adelantado (los ciclos A/B/C
// son enteramente calculables de antemano, no dependen de que alguien
// publique "lo de hoy" cada mañana), así que se puede consultar cualquier
// fecha futura — y a diferencia de la fuente que se usaba antes acá
// (Vatican News), sí incluye el Salmo.
//
// Sin CORS propio: esta página se llama desde el navegador de OTRO
// proyecto (app-equipo), así que hace falta agregar el header a mano —
// es una consulta de solo lectura sobre datos públicos, no hace falta
// ninguna clave ni CRON_SECRET.
//
// Nota: esto lee el HTML de una página pensada para que la lea una
// persona, no una API — si misadehoy.org rediseña esa página, este parseo
// se puede romper y va a hacer falta ajustarlo. No afecta para nada a la
// publicación automática de todos los días (esa sigue usando el feed de
// evangelizo.org directo, sin relación con este archivo).

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

// El texto de cada lectura viene como <p>...<br />...</p> dentro de un
// <div class="misadehoy-lecturas__texto">. <br/> se convierte en salto de
// línea (separa los versos) y </p> en línea en blanco (separa estrofas) —
// así se preserva la estructura en vez de aplastar todo en un solo párrafo.
function textoDesdeHtml(htmlFragmento) {
  return decodeEntities(
    htmlFragmento
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Cada lectura vive en su propio <article id="lect-{YYYYMMDD}-{codigo}">
// — códigos fijos: fr=primera lectura, ps=salmo, sr=segunda lectura (solo
// domingos/solemnidades), gsp=evangelio, reflexion=reflexión (no todos los
// días la traen). Ausente = null, no error: un lunes cualquiera no tiene
// segunda lectura, y eso es normal, no un fallo del parseo.
function extraerPanel(html, fechaCompacta, codigo) {
  const re = new RegExp(`<article[^>]*id="lect-${fechaCompacta}-${codigo}"[^>]*>([\\s\\S]*?)<\\/article>`);
  const match = html.match(re);
  if (!match) return null;
  // El evangelio tiene una clase EXTRA en el mismo div ("...__texto
  // misadehoy-evangelio__texto") — por eso el match busca la clase en
  // cualquier parte de un class="...", no pegada justo antes de la
  // comilla de cierre.
  const textoMatch = match[1].match(/class="[^"]*misadehoy-lecturas__texto[^"]*">([\s\S]*?)<\/div>/);
  return textoMatch ? textoDesdeHtml(textoMatch[1]) || null : null;
}

function extraerLecturas(html, fecha) {
  const fechaCompacta = fecha.replace(/-/g, '');
  const primeraLectura = extraerPanel(html, fechaCompacta, 'fr');
  const salmo = extraerPanel(html, fechaCompacta, 'ps');
  const segundaLectura = extraerPanel(html, fechaCompacta, 'sr');
  const evangelio = extraerPanel(html, fechaCompacta, 'gsp');
  const reflexion = extraerPanel(html, fechaCompacta, 'reflexion');
  if (!primeraLectura && !evangelio) return null;

  const tituloMatch = html.match(/misadehoy-lecturas__temporada">([^<]+)</);
  const tituloDia = tituloMatch ? decodeEntities(tituloMatch[1]).trim() : null;

  return { primeraLectura, salmo, segundaLectura, evangelio, reflexion, tituloDia };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ ok: false, error: 'Falta ?fecha=YYYY-MM-DD' });
    return;
  }
  const [anio, mes] = fecha.split('-');

  try {
    const url = `https://misadehoy.org/calendario-liturgico/?fecha=${fecha}&mes=${anio}-${mes}`;
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    const html = await respuesta.text();
    const lecturas = extraerLecturas(html, fecha);
    if (!lecturas) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    res.status(200).json({ ok: true, fecha, ...lecturas });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
};
