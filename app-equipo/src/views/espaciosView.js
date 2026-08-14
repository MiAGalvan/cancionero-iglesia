// Pantalla para agregar, editar o borrar parroquias/capillas (espacios). A
// diferencia de las carpetas litúrgicas (12 fijas + agregadas), acá no hay
// ninguna lista fija: todo se puede reorganizar, porque a medida que esto
// se usa en más lugares (otras ciudades, otras provincias) hace falta poder
// diferenciarlas claramente por localidad y provincia.
import { getSpaces, addSpace, updateSpace, deleteSpace, getCurrentSpaceKey } from '../storage/settings.js';
import { getSession } from '../storage/auth.js';
import { uploadSpaceLogo, getLogosForSpaces } from '../storage/logos.js';
import { pushSpace, pushSpaceDeletion, syncSpacesNow } from '../storage/spacesSync.js';

export async function renderEspaciosView(container) {
  const loggedIn = Boolean(await getSession());
  let logos = await getLogosForSpaces(getSpaces().map((s) => s.key));

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Parroquias y capillas</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Cada una tiene su propio cancionero, lista de misa, QR y pantalla de
        proyección, separados del resto — aunque todas comparten esta misma
        app y el mismo login del equipo.
        ${
          loggedIn
            ? ''
            : ' Iniciá sesión para poder subir o cambiar el logo de cada una.'
        }
      </p>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="add-space-btn">+ Agregar parroquia o capilla</button>
      </div>
      <div id="logo-status" class="warning-box" hidden></div>
      <ul class="song-list" id="spaces-list"></ul>
    </div>
  `;

  const listEl = container.querySelector('#spaces-list');
  const statusEl = container.querySelector('#logo-status');

  function render() {
    const spaces = [...getSpaces()].sort((a, b) => {
      const byProvince = (a.province || '').localeCompare(b.province || '', 'es');
      return byProvince !== 0 ? byProvince : a.label.localeCompare(b.label, 'es');
    });
    listEl.innerHTML = spaces.map(spaceItemHtml).join('');
  }

  function spaceItemHtml(space) {
    const place = [space.locality, space.province].filter(Boolean).join(', ');
    const logoUrl = logos[space.key];
    return `
      <li class="song-item space-item" data-key="${escapeAttr(space.key)}">
        <span class="space-info">
          ${logoUrl ? `<img class="space-logo-thumb" src="${escapeAttr(logoUrl)}" alt="" />` : ''}
          <span>
            ${escapeHtml(space.label)}${space.key === getCurrentSpaceKey() ? ' <span class="category-tag">actual</span>' : ''}
            <span class="song-artist">${escapeHtml(place || 'Sin localidad/provincia todavía')}</span>
          </span>
        </span>
        ${
          loggedIn
            ? `<label class="btn btn-icon" title="Subir o cambiar el logo">
                🖼️
                <input type="file" accept="image/*" data-logo-input="${escapeAttr(space.key)}" hidden />
              </label>`
            : ''
        }
        <button type="button" class="btn btn-icon" data-edit="${escapeAttr(space.key)}" title="Editar">✏️</button>
        <button type="button" class="btn btn-danger btn-icon" data-delete="${escapeAttr(space.key)}" title="Eliminar">✕</button>
      </li>`;
  }

  listEl.addEventListener('change', async (event) => {
    const spaceKey = event.target.dataset.logoInput;
    if (!spaceKey) return;
    const file = event.target.files[0];
    if (!file) return;

    event.target.disabled = true;
    statusEl.hidden = true;
    try {
      await uploadSpaceLogo(spaceKey, file);
      logos = await getLogosForSpaces(getSpaces().map((s) => s.key));
      render();
    } catch (err) {
      statusEl.textContent =
        err?.code === '42501' || err?.statusCode === '403'
          ? 'Tu usuario no tiene permiso para subir el logo de esta parroquia.'
          : `No se pudo subir el logo: ${err?.message || err}`;
      statusEl.hidden = false;
      event.target.disabled = false;
    }
  });

  container.querySelector('#add-space-btn').addEventListener('click', () => {
    const label = prompt('Nombre de la parroquia o capilla');
    if (label === null || !label.trim()) return;
    const locality = prompt('Localidad (ciudad/pueblo)', '') || '';
    const province = prompt('Provincia', '') || '';
    const created = addSpace({ label, locality, province });
    if (created) {
      render();
      pushSpace(created); // en segundo plano, no bloquea la pantalla
    }
  });

  listEl.addEventListener('click', (event) => {
    const editKey = event.target.dataset.edit;
    const deleteKey = event.target.dataset.delete;

    if (editKey) {
      const space = getSpaces().find((s) => s.key === editKey);
      if (!space) return;
      const label = prompt('Nombre', space.label);
      if (label === null || !label.trim()) return;
      const locality = prompt('Localidad (ciudad/pueblo)', space.locality || '');
      if (locality === null) return;
      const province = prompt('Provincia', space.province || '');
      if (province === null) return;
      const updated = updateSpace(editKey, { label, locality, province });
      render();
      if (updated) pushSpace(updated);
    } else if (deleteKey) {
      const space = getSpaces().find((s) => s.key === deleteKey);
      if (!space) return;
      const confirmado = confirm(
        `¿Eliminar "${space.label}"? El cancionero y las listas que ya tenía no se borran, pero dejan de ser accesibles desde acá.`
      );
      if (!confirmado) return;
      const deleted = deleteSpace(deleteKey);
      if (!deleted) {
        alert('No se puede eliminar: tiene que quedar al menos una parroquia o capilla.');
        return;
      }
      render();
      pushSpaceDeletion(deleted);
    }
  });

  // Al abrir esta pantalla, de paso bajamos lo que hayan agregado/editado
  // desde otros dispositivos — así no hace falta ir primero a la
  // biblioteca para que aparezca una parroquia nueva.
  syncSpacesNow().then(async (result) => {
    if (!result.changed) return;
    logos = await getLogosForSpaces(getSpaces().map((s) => s.key));
    render();
  });

  render();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
