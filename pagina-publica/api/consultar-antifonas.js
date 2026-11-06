// Consulta a demanda la antífona de entrada, la de comunión y el salmo
// (con su respuesta) de UNA fecha, para mostrarlos junto a las lecturas en el
// Cronograma (ayudan a saber de qué va la misa y a elegir los cantos de
// entrada, de comunión y el salmo cantado).
//
// Fuente: eucaristiadiaria.cl (Arquidiócesis de Santiago de Chile) — la
// única que encontramos que trae las antífonas y la respuesta del salmo; el
// resto de las lecturas siguen viniendo de Evangelizo / misadehoy.org (ver
// consultar-lecturas.js). Ojo: es el misal
// y el calendario de Chile; en los domingos del tiempo ordinario coincide
// con el de Argentina, pero en una fiesta propia de cada país puede no
// coincidir — por eso la pantalla lo avisa.
//
// Respeta a la página: se pide solo cuando alguien lo consulta, y la
// respuesta queda en el caché de Vercel un día entero (Cache-Control), así
// que una misma fecha se trae como mucho una vez por día aunque la miren
// varias personas. Su robots.txt pide 10 segundos entre pedidos (Crawl-delay).
//
// Sin CORS propio, igual que consultar-lecturas.js: lo llama el navegador de
// app-equipo, es solo lectura sobre datos públicos.
const { extraerAntifonas } = require('./_antifonas.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ ok: false, error: 'Falta ?fecha=YYYY-MM-DD' });
    return;
  }

  try {
    const respuesta = await fetch(`https://www.eucaristiadiaria.cl/dia_cal.php?fecha=${fecha}`, {
      headers: { 'User-Agent': 'RezarCantando/1.0 (cancionero parroquial)' },
    });
    if (!respuesta.ok) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    const antifonas = extraerAntifonas(await respuesta.text());
    if (!antifonas) {
      res.status(200).json({ ok: false, motivo: 'no-disponible', fecha });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ ok: true, fecha, fuente: 'eucaristiadiaria.cl', ...antifonas });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
};
