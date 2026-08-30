// Importación masiva del cancionero en papel de Nuestra Señora de la
// Merced (un .docx de 313 canciones que el usuario pasó, ya parseado acá
// afuera a JSON — ver src/data/cancionero-merced-import.json). Pantalla de
// un solo uso, pensada para correrse una vez desde el dispositivo de
// alguien ya logueado en esa parroquia — así el guardado local y la
// sincronización a Supabase usan la sesión real del equipo, que esta
// herramienta no tiene.
//
// Las canciones del índice temático del libro (Entrada, Perdón, Gloria,
// Salmos→Entrada de la Palabra, Aleluya, Ofrendas→Ofertorio, Comunión,
// Santo, Meditación, Salida) ya venían agrupadas por MOMENTO de la misa,
// así que van directo a la categoría fija correspondiente. Las de temas/
// épocas (María, Don Bosco, Navidad, Cuaresma, Domingo de Ramos, Semana
// Santa, Pascua, Espíritu Santo, Bautismo, Animación, Varios) el libro las
// agrupa por ÉPOCA, no por momento — no hay forma de saber de acá si tal
// canción de Cuaresma va en la Entrada o en la Comunión, así que quedan en
// su propia carpeta nueva (con la etiqueta de época puesta, para poder
// filtrar por tiempo litúrgico igual) y el equipo las va reubicando de a
// poco con el botón "📁 Mover" del cancionero, canción por canción.
import { getSession } from '../storage/auth.js';
import { getAllSongs, saveSong } from '../storage/db.js';
import { syncNow } from '../storage/sync.js';
import { pushCustomCategory } from '../storage/labelsSync.js';
import { addCustomCategory, getCurrentSpaceKey, getDeviceGroup, getSpaceLabel, getModoLectura } from '../storage/settings.js';
import { pastedTextToChordPro } from '../parser/chordProParser.js';
import datosImport from '../data/cancionero-merced-import.json';

const ESPACIO_OBJETIVO = 'merced';

export async function renderImportarCancioneroView(container) {
  const session = await getSession();
  const loggedIn = Boolean(session);
  const espacioActual = getCurrentSpaceKey();
  const puedeImportar = loggedIn && !getModoLectura() && espacioActual === ESPACIO_OBJETIVO;

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Importar cancionero (Merced)</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Carga de una sola vez las ${datosImport.canciones.length} canciones del cancionero en papel de
        Nuestra Señora de la Merced, ya separadas por carpeta según el índice del libro. Se puede
        tocar más de una vez sin miedo a duplicar: salta las que ya existan (por título).
      </p>
      ${
        !loggedIn
          ? `<div class="warning-box">Iniciá sesión para poder importar (hace falta para guardar y sincronizar). <a href="#/login?returnTo=${encodeURIComponent(
              '/importar-cancionero'
            )}">Ingresar</a></div>`
          : espacioActual !== ESPACIO_OBJETIVO
          ? `<div class="warning-box">Este importador es solo para Nuestra Señora de la Merced — en Inicio, arriba, cambiá la parroquia actual a "${escapeHtml(
              getSpaceLabel(ESPACIO_OBJETIVO)
            )}" antes de importar.</div>`
          : ''
      }
      <div class="categories-field">
        <span class="categories-label">📁 Carpetas nuevas que se van a crear (si no existen ya)</span>
        <p class="chord-editor-hint">${escapeHtml(datosImport.nuevas_categorias.join(', '))}</p>
        <p class="chord-editor-hint">
          Estas son temáticas (María, Navidad, Cuaresma, etc.), no de momento de la misa — el libro
          las agrupa por época, así que después conviene reubicar cada canción con el botón
          "📁 Mover" del cancionero, a la categoría real donde se canta.
        </p>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="importar-btn" ${puedeImportar ? '' : 'disabled'}>
          📥 Importar ${datosImport.canciones.length} canciones
        </button>
      </div>
      <div id="importar-status" class="warning-box" hidden></div>
    </div>
  `;

  if (!puedeImportar) return;

  const statusEl = container.querySelector('#importar-status');
  const btn = container.querySelector('#importar-btn');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    statusEl.hidden = false;
    statusEl.textContent = 'Preparando carpetas...';

    for (const nombre of datosImport.nuevas_categorias) {
      addCustomCategory(ESPACIO_OBJETIVO, nombre);
      pushCustomCategory(ESPACIO_OBJETIVO, nombre); // en segundo plano
    }

    const existentes = await getAllSongs(ESPACIO_OBJETIVO);
    const titulosExistentes = new Set(existentes.map((s) => s.title.trim().toLowerCase()));
    const updatedBy = getDeviceGroup() || null;

    let creadas = 0;
    let saltadas = 0;
    for (const cancion of datosImport.canciones) {
      if (titulosExistentes.has(cancion.titulo.trim().toLowerCase())) {
        saltadas += 1;
        continue;
      }
      await saveSong({
        title: cancion.titulo,
        artist: '',
        categories: cancion.categorias,
        chordpro: pastedTextToChordPro(cancion.letra),
        space: ESPACIO_OBJETIVO,
        tags: cancion.tags,
        updatedBy,
      });
      creadas += 1;
      if (creadas % 20 === 0) {
        statusEl.textContent = `Importando... ${creadas + saltadas} de ${datosImport.canciones.length}`;
      }
    }

    statusEl.textContent = `✓ ${creadas} canciones nuevas, ${saltadas} ya existían. Sincronizando con la nube...`;
    const resultado = await syncNow();
    statusEl.textContent = resultado.synced
      ? `✓ Listo: ${creadas} canciones nuevas, ${saltadas} ya existían y se saltearon. Sincronizado (${resultado.pushed} subidas).`
      : `✓ Se importaron ${creadas} canciones acá en este dispositivo, pero no se pudo sincronizar todavía (revisá la conexión) — probá tocar "🔄 Sincronizar" en Inicio en un rato.`;
    btn.disabled = false;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
