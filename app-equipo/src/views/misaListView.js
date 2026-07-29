// "Armar lista de misa": para una fecha, elegir UNA canción por cada una de
// las categorías (las 12 litúrgicas fijas, más las carpetas que el equipo
// haya agregado) — o dejarla vacía si ese día no aplica, ej. no siempre hay
// "Entrada de la Palabra". Se guarda en IndexedDB, 100% offline; publicarla
// a la nube es un paso aparte (ver publicarView.js).
import { getSongsByCategory, getMisa, saveMisa, getAllMisas } from '../storage/db.js';
import { getAllCategories } from '../storage/settings.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderMisaListView(container, { fecha } = {}) {
  const selectedFecha = fecha || todayIso();
  const categories = getAllCategories();

  const [existing, songsByCategory, allMisas] = await Promise.all([
    getMisa(selectedFecha),
    Promise.all(categories.map((cat) => getSongsByCategory(cat))),
    getAllMisas(),
  ]);
  const items = existing ? existing.items : {};

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Lista de misa</h2>
      <a class="btn" href="#/qr">Ver QR</a>
    </div>
    <div class="form-view misa-view">
      <label>
        Fecha de la misa
        <input type="date" id="fecha-input" value="${selectedFecha}" />
      </label>

      <div class="misa-categories">
        ${categories.map((cat, i) => renderCategoryRow(cat, songsByCategory[i], items[cat])).join('')}
      </div>

      <div class="form-actions">
        <button class="btn btn-accent" id="save-btn">Guardar lista</button>
        <a class="btn" id="publish-link" href="#/publicar/${selectedFecha}">Ir a publicar →</a>
      </div>

      ${allMisas.length ? renderMisasGuardadas(allMisas) : ''}
    </div>
  `;

  const fechaInput = container.querySelector('#fecha-input');
  fechaInput.addEventListener('change', () => {
    window.location.hash = `#/misa/${fechaInput.value}`;
  });

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const newItems = {};
    for (const cat of categories) {
      const select = container.querySelector(`select[data-category="${cssEscape(cat)}"]`);
      newItems[cat] = select.value ? Number(select.value) : null;
    }
    await saveMisa(fechaInput.value, newItems);
    // Re-renderizamos la misma pantalla en vez de solo cambiar el hash, para
    // que "Misas guardadas" se actualice ya mismo aunque la fecha no haya
    // cambiado (un cambio de hash a la misma ruta no dispara el router).
    await renderMisaListView(container, { fecha: fechaInput.value });
  });
}

function renderCategoryRow(category, songs, selectedSongId) {
  return `
    <div class="misa-category-row">
      <span class="misa-category-name">${escapeHtml(category)}</span>
      <select data-category="${escapeAttr(category)}">
        <option value="">— (sin canción) —</option>
        ${songs
          .map(
            (song) => `
          <option value="${song.id}" ${song.id === selectedSongId ? 'selected' : ''}>
            ${escapeHtml(song.title)}${song.artist ? ` — ${escapeHtml(song.artist)}` : ''}
          </option>`
          )
          .join('')}
      </select>
    </div>
  `;
}

function renderMisasGuardadas(misas) {
  return `
    <div class="sidebar-group">
      <h3>Misas guardadas</h3>
      <ul class="song-list">
        ${misas
          .map(
            (misa) => `
          <li class="song-item">
            <a href="#/misa/${misa.fecha}">${formatFecha(misa.fecha)}</a>
            <a class="btn" href="#/publicar/${misa.fecha}">Publicar</a>
          </li>`
          )
          .join('')}
      </ul>
    </div>
  `;
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function cssEscape(text) {
  return text.replace(/"/g, '\\"');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
