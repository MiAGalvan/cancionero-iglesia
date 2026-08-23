// Trabajo automático (ver vercel.json → crons) que corre solo dos veces por
// semana: de madrugada todos los días, y el sábado a las 18hs — trae el
// Evangelio, la 1ª Lectura, el Salmo y la 2ª Lectura (cuando hay) del feed
// público de evangelizo.org, y los publica en Novedades para TODAS las
// parroquias — el calendario litúrgico es el mismo en cualquier lado, así
// que no hace falta cargarlo a mano en cada una.
//
// El sábado a las 18hs es la corrida especial: desde esa hora, la misa
// vespertina ya toma las lecturas del DOMINGO (cumple la obligación
// dominical) — ver calcularFechas() más abajo.
//
// No usa ninguna librería (ni siquiera @supabase/supabase-js): son pedidos
// REST directos a Supabase con la service role key, que evita las
// políticas de RLS pensadas para el equipo (acá no hay ningún usuario
// logueado, es un trabajo que corre solo). Por eso esa key NUNCA puede
// viajar a ningún código que corra en el navegador — vive solo acá, como
// variable de entorno en Vercel (Project Settings → Environment
// Variables → SUPABASE_SERVICE_ROLE_KEY), nunca en este archivo ni en
// ningún archivo que se sirva tal cual al público.
//
// Si alguien del equipo corrigió a mano una lectura de HOY (columna
// auto_generated = false), este trabajo no la toca — gana la corrección
// humana. Solo pisa lo que él mismo generó automáticamente antes.

const RSS_URL = 'https://rss.evangelizo.org/rss/v2/evangelizo_rss-sp.xml';
const SUPABASE_URL = 'https://mfmlbykzraejkcrdkjpw.supabase.co';

const CATEGORIA_A_TITULO = {
  'LECTIO 1': '1ª Lectura',
  PSALMUS: 'Salmo',
  'LECTIO 2': '2ª Lectura',
  EVANGELIUM: 'Evangelio',
};

function decodeXmlEntities(text) {
  return (text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// El feed no trae los campos anidados ni raro — cada <item> es un bloque
// plano, así que alcanza con partirlo a mano en vez de sumar una
// dependencia solo para esto.
function parsearItems(xmlText) {
  const items = [];
  const bloques = xmlText.split('<item>').slice(1);
  for (const bloque of bloques) {
    const cuerpo = bloque.split('</item>')[0];
    const category = (cuerpo.match(/<category>([^<]*)<\/category>/) || [])[1];
    const guid = (cuerpo.match(/<guid[^>]*>([^<]*)<\/guid>/) || [])[1];
    const title = (cuerpo.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const description = (cuerpo.match(/<description>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/description>/) || [])[1];
    items.push({
      category: category ? category.trim() : null,
      fecha: guid ? guid.slice(0, 10) : null,
      titulo: title ? decodeXmlEntities(title.trim()) : null,
      cuerpo: description ? decodeXmlEntities(description.trim()).replace(/\r\n/g, '\n') : null,
    });
  }
  return items;
}

// "Domingo, 23 De Agosto : Evangelio según San Mateo 16,13-20." -> solo la
// referencia, sin el día/fecha (eso ya lo sabemos por separado). Se
// antepone al cuerpo, es útil para quien lee la lectura en voz alta.
function referenciaDelTitulo(titulo) {
  const partes = (titulo || '').split(' : ');
  return partes.length > 1 ? partes.slice(1).join(' : ').trim() : '';
}

// Argentina es UTC-3 fijo, sin horario de verano desde 2009 — alcanza con
// este corrimiento simple, no hace falta Intl con timezone. Ojo: como el
// objeto ya viene "corrido", hay que leerlo siempre con los métodos UTC*
// (getUTCDay, getUTCHours, toISOString) — los métodos locales (getDay,
// getHours) dependerían de en qué zona horaria esté configurado el
// servidor que ejecuta esto, no de la Argentina.
function ahoraEnArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

// El sábado, desde que empieza la misa vespertina (18hs en adelante), ya
// se toma el Evangelio y las lecturas del DOMINGO — es la misa de
// vigilia, cumple igual la obligación dominical. Se publica con la fecha
// de HOY (sábado) para que el aviso "en vivo hoy" siga funcionando toda
// la tarde/noche del sábado — pero el CONTENIDO en sí (el texto) se busca
// en el feed con la fecha de mañana (domingo), no la de hoy.
function calcularFechas() {
  const ahora = ahoraEnArgentina();
  const diaSemana = ahora.getUTCDay(); // 0 = domingo, 6 = sábado
  const horas = ahora.getUTCHours();
  const fechaObjetivo = ahora.toISOString().slice(0, 10);

  const esVigiliaSabado = diaSemana === 6 && horas >= 18;
  if (!esVigiliaSabado) {
    return { fechaObjetivo, fechaContenido: fechaObjetivo };
  }

  const domingo = new Date(ahora);
  domingo.setUTCDate(domingo.getUTCDate() + 1);
  return { fechaObjetivo, fechaContenido: domingo.toISOString().slice(0, 10) };
}

const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');
function normalizarTitulo(texto) {
  return (texto || '').normalize('NFD').replace(COMBINING_MARKS, '').trim().toUpperCase();
}
function tituloCoincideConLectura(tituloGuardado, tituloCanonico) {
  return normalizarTitulo(tituloGuardado).startsWith(normalizarTitulo(tituloCanonico));
}

async function supabaseFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // PostgREST no siempre manda cuerpo aunque salga bien (ej. un
  // insert/update sin pedir "return=representation" vuelve 200/201 con el
  // cuerpo vacío, no necesariamente 204) — antes esto asumía que solo un
  // 204 podía venir sin cuerpo, y romper el parseo de JSON en cualquier
  // otro caso vacío.
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} -> ${res.status}: ${texto.slice(0, 300)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

async function registrarEstado({ exito, error, espaciosActualizados }) {
  try {
    await supabaseFetch('/cron_status?on_conflict=job', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: {
        job: 'sync-lecturas',
        last_run_at: new Date().toISOString(),
        last_success: exito,
        last_error: error || null,
        spaces_updated: espaciosActualizados ?? null,
      },
    });
  } catch {
    // Si ni siquiera esto se pudo guardar, no hay mucho más para hacer acá
    // (ya se está respondiendo el error al llamador igual, ver handler).
  }
}

module.exports = async (req, res) => {
  // Vercel agrega este header solo en los pedidos que dispara el cron
  // (ver vercel.json) cuando existe la variable de entorno CRON_SECRET —
  // sin esto, cualquiera que encuentre la URL podría disparar el trabajo
  // a mano repetidas veces.
  const secretoEsperado = process.env.CRON_SECRET;
  if (secretoEsperado && req.headers.authorization !== `Bearer ${secretoEsperado}`) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    return;
  }

  try {
    const { fechaObjetivo, fechaContenido } = calcularFechas();

    const rssRes = await fetch(RSS_URL);
    if (!rssRes.ok) throw new Error(`No se pudo traer el feed (${rssRes.status})`);
    const xml = await rssRes.text();
    const items = parsearItems(xml);

    const itemsDeHoy = items.filter((item) => item.fecha === fechaContenido && CATEGORIA_A_TITULO[item.category]);
    if (itemsDeHoy.length === 0) {
      await registrarEstado({
        exito: false,
        error: `El feed todavía no tiene las lecturas para ${fechaContenido}`,
        espaciosActualizados: 0,
      });
      res.status(200).json({ ok: false, motivo: 'sin-lecturas-todavia', fechaObjetivo, fechaContenido });
      return;
    }

    const espacios = await supabaseFetch('/spaces?select=key&deleted_at=is.null');
    let filasEscritas = 0;

    for (const espacio of espacios) {
      const existentes = await supabaseFetch(
        `/anuncios?select=id,titulo,auto_generated,fecha&space=eq.${encodeURIComponent(espacio.key)}`
      );

      for (const item of itemsDeHoy) {
        const tituloCanonico = CATEGORIA_A_TITULO[item.category];
        const referencia = referenciaDelTitulo(item.titulo);
        const cuerpoFinal = referencia ? `${referencia}\n\n${item.cuerpo}` : item.cuerpo;

        const existente = existentes.find((a) => tituloCoincideConLectura(a.titulo, tituloCanonico));

        // Ya la corrigió una persona hoy mismo: no la pisamos.
        if (existente && existente.fecha === fechaObjetivo && existente.auto_generated === false) continue;

        const payload = {
          space: espacio.key,
          titulo: tituloCanonico,
          cuerpo: cuerpoFinal,
          fecha: fechaObjetivo,
          auto_generated: true,
          updated_at: new Date().toISOString(),
        };

        if (existente) {
          await supabaseFetch(`/anuncios?id=eq.${existente.id}`, { method: 'PATCH', body: payload });
        } else {
          await supabaseFetch('/anuncios', { method: 'POST', body: payload });
        }
        filasEscritas++;
      }
    }

    await registrarEstado({ exito: true, espaciosActualizados: espacios.length });
    res.status(200).json({ ok: true, fechaObjetivo, fechaContenido, espacios: espacios.length, filasEscritas });
  } catch (error) {
    await registrarEstado({ exito: false, error: String(error && error.message ? error.message : error) });
    res.status(500).json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
};
