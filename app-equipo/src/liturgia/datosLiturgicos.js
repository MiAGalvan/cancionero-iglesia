// Trae los textos de una misa (antífonas, salmo con su respuesta, lecturas,
// Evangelio) de las dos consultas de la página pública, y los deja listos
// para sugerir canciones (ver search/sugerencias.js). Son las mismas
// consultas que usa "Ver lecturas" del Cronograma:
//  - consultar-lecturas  → lecturas y Evangelio (misadehoy.org)
//  - consultar-antifonas → antífonas y salmo con respuesta (eucaristiadiaria.cl)
// Cada una se resuelve por su cuenta: si falla una, se usa la otra.
import { tiempoDesdeTitulo } from '../search/sugerencias.js';
import { PUBLIC_URL } from '../views/qrView.js';

const cache = new Map();

async function pedir(ruta, fecha) {
  try {
    const res = await fetch(`${PUBLIC_URL}api/${ruta}?fecha=${fecha}`);
    return await res.json();
  } catch {
    return null;
  }
}

// { ok, tituloDia, tiempo, fuentes, faltan }. `ok` = hay al menos algo para
// trabajar; `faltan` lista lo que no se pudo traer (para avisarlo).
export async function traerDatosLiturgicos(fecha) {
  if (cache.has(fecha)) return cache.get(fecha);

  const [lecturas, antifonas] = await Promise.all([pedir('consultar-lecturas', fecha), pedir('consultar-antifonas', fecha)]);
  const lecturasOk = Boolean(lecturas?.ok);
  const antifonasOk = Boolean(antifonas?.ok);

  const fuentes = {
    entrada: antifonasOk ? antifonas.entrada?.texto || '' : '',
    comunion: antifonasOk ? antifonas.comunion?.texto || '' : '',
    respuesta: antifonasOk ? antifonas.salmo?.respuesta || '' : '',
    salmo: (antifonasOk && antifonas.salmo?.texto) || (lecturasOk ? lecturas.salmo || '' : ''),
    evangelio: lecturasOk ? lecturas.evangelio || '' : '',
    primeraLectura: lecturasOk ? lecturas.primeraLectura || '' : '',
    segundaLectura: lecturasOk ? lecturas.segundaLectura || '' : '',
  };

  const faltan = [];
  if (!lecturasOk) faltan.push('lecturas y Evangelio');
  if (!antifonasOk) faltan.push('antífonas y salmo');

  const datos = {
    ok: lecturasOk || antifonasOk,
    tituloDia: lecturasOk ? lecturas.tituloDia || null : null,
    tiempo: lecturasOk ? tiempoDesdeTitulo(lecturas.tituloDia) : null,
    fuentes,
    faltan,
  };
  // Solo se recuerda si llegó completo: si falló algo, se reintenta la
  // próxima vez que se abra.
  if (lecturasOk && antifonasOk) cache.set(fecha, datos);
  return datos;
}
