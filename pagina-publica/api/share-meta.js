// Sirve la MISMA app.html de siempre, pero con el título/descripción/imagen
// que leen WhatsApp/Facebook/Instagram para armar la vista previa (og:title,
// og:description, og:image, <meta name="description">) ajustados a la
// parroquia del link compartido — antes eran fijos ("Rezar Cantando" para
// todas), así que una publicación hecha desde San Cayetano se veía igual
// que una hecha desde Merced, sin forma de saber de qué lugar era.
//
// Hace falta una función para esto (en vez de tocar solo app.html) porque
// WhatsApp/Facebook NO ejecutan el JS de la página al armar la vista previa
// — solo leen el HTML tal cual llega. `space` viaja en la URL (?space=...,
// como siempre) pero ese dato solo lo tiene el navegador DESPUÉS de correr
// app.js, así que sin este paso del lado del servidor no hay forma de que
// la vista previa sepa de qué parroquia se trata.
//
// vercel.json redirige la ruta "/" acá (rewrite) — para cualquier persona
// real es 100% transparente: recibe el mismo HTML de siempre, con el mismo
// app.js, nada cambia salvo el texto/imagen de estas etiquetas puntuales.
//
// OJO con el nombre del archivo base: se llama "app.html" (no "index.html")
// A PROPÓSITO — Vercel sirve un archivo estático llamado "index.html" en
// "/" ANTES de mirar los rewrites de vercel.json, así que si existiera un
// index.html en la carpeta, esta función nunca se llegaría a ejecutar (el
// rewrite quedaría siempre "tapado" por el archivo). Renombrarlo saca ese
// conflicto: "/" ya no tiene ningún archivo estático que lo sirva directo,
// así que el rewrite es la única forma de resolverlo.

const SUPABASE_URL = 'https://mfmlbykzraejkcrdkjpw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mbWxieWt6cmFlamtjcmRranB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMDUyMTAsImV4cCI6MjEwMDY4MTIxMH0.qb8QMD6zEy-Pk182-Q0qKa_EVwIMQTEw6KYiJhm77SM';

const DESCRIPCION_GENERICA = 'Cantar y tocar es rezar. Mirá las lecturas de la misa de hoy.';

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

async function buscarNombreParroquia(spaceKey) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/spaces?key=eq.${encodeURIComponent(spaceKey)}&select=label,locality`;
    const resp = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.label) return null;
    return row.locality ? `${row.label} — ${row.locality}` : row.label;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const host = req.headers.host || 'cancionero-iglesia-qk5n.vercel.app';
  const url = new URL(req.url, `https://${host}`);
  const spaceKey = url.searchParams.get('space') || 'merced';

  let html;
  try {
    // Se trae la app.html tal cual está publicada, en vez de duplicarla
    // acá adentro — así esta función nunca queda desactualizada si el
    // diseño de la página cambia; solo reemplaza las líneas puntuales.
    const resp = await fetch(`https://${host}/app.html`);
    if (!resp.ok) throw new Error(`app.html respondió ${resp.status}`);
    html = await resp.text();
  } catch (err) {
    // Si por lo que sea no se pudo traer la base, mandamos a la persona real
    // directo al archivo estático de siempre — mejor una vista previa
    // genérica que una página rota.
    res.writeHead(302, { Location: `/app.html${url.search}` });
    res.end();
    return;
  }

  const nombreParroquia = await buscarNombreParroquia(spaceKey);

  // El nombre de la app se mantiene como título grande (og:title, lo que
  // WhatsApp/Facebook muestran en negrita) — el nombre de la parroquia va
  // en la descripción, que se ve más chica debajo. OJO: muchas apps (sobre
  // todo Facebook, en el formato compacto de "compartir un link") ni
  // siquiera muestran la descripción — por eso la imagen (og:image) ahora
  // también lleva el nombre y el color de la parroquia adentro (ver
  // api/og-image.js), que es lo único que esas apps SIEMPRE muestran.
  const descripcion = nombreParroquia ? `${nombreParroquia} — ${DESCRIPCION_GENERICA}` : DESCRIPCION_GENERICA;
  const imagenUrl = `https://${host}/api/og-image?space=${encodeURIComponent(spaceKey)}`;

  html = html
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeAttr(descripcion)}" />`
    )
    .replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${escapeAttr(descripcion)}" />`
    )
    .replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${escapeAttr(imagenUrl)}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />`
    );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cacheado poco tiempo: si alguien cambia el nombre de la parroquia, no
  // hace falta esperar horas a que las redes sociales vean el cambio.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
