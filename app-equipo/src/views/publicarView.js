// Vista previa de lo que se va a publicar (título + letra sin acordes de
// cada categoría con canción elegida) y el botón que efectivamente lo sube a
// Supabase. El botón "Publicar" solo funciona con sesión iniciada — sin
// sesión, ni siquiera lo intenta (y aunque lo intentara, la base de datos lo
// rechaza igual por RLS, ver supabase/schema.sql).
import { getMisa } from '../storage/db.js';
import { buildPublishPayload, publishMisa } from '../liturgia/publicar.js';
import { getSession } from '../storage/auth.js';
import { isSupabaseConfigured } from '../storage/supabaseClient.js';

export async function renderPublicarView(container, { fecha }) {
  const misa = await getMisa(fecha);

  if (!misa) {
    container.innerHTML = `
      <div class="topbar">
        <a class="btn" href="#/misa/${fecha}">← Lista de misa</a>
        <h2>Publicar</h2>
        <span></span>
      </div>
      <div class="empty-state">Todavía no armaste la lista de esta fecha. <a href="#/misa/${fecha}">Armarla ahora</a>.</div>
    `;
    return;
  }

  const [items, session] = await Promise.all([buildPublishPayload(misa), getSession()]);
  const loggedIn = Boolean(session);

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/misa/${fecha}">← Lista de misa</a>
      <h2>Publicar — ${formatFecha(fecha)}</h2>
      <span></span>
    </div>
    <div class="form-view publicar-view">
      ${
        !isSupabaseConfigured
          ? `<div class="warning-box">Falta configurar Supabase en <code>src/storage/supabaseClient.js</code>.</div>`
          : !loggedIn
          ? `<div class="warning-box">
              Iniciá sesión para poder publicar.
              <a href="#/login?returnTo=${encodeURIComponent(`/publicar/${fecha}`)}">Ingresar</a>
            </div>`
          : ''
      }

      ${
        items.length === 0
          ? `<div class="empty-state">No hay ninguna canción elegida todavía en esta lista.</div>`
          : `<ul class="publicar-preview">
              ${items
                .map(
                  (item) => `
                <li>
                  <strong>${escapeHtml(item.categoria)}</strong> — ${escapeHtml(item.titulo_cancion)}
                </li>`
                )
                .join('')}
            </ul>`
      }

      <div id="publish-status" class="warning-box" hidden></div>

      <div class="form-actions">
        <button
          class="btn btn-accent"
          id="publish-btn"
          ${loggedIn && isSupabaseConfigured && items.length ? '' : 'disabled'}
        >
          Publicar lista de hoy
        </button>
      </div>
    </div>
  `;

  const publishBtn = container.querySelector('#publish-btn');
  const statusEl = container.querySelector('#publish-status');

  publishBtn.addEventListener('click', async () => {
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';
    statusEl.hidden = true;
    try {
      await publishMisa(misa);
      statusEl.textContent = '✓ Lista publicada. Ya se puede ver escaneando el QR.';
      statusEl.hidden = false;
    } catch (err) {
      statusEl.textContent =
        err.message === 'Failed to fetch'
          ? 'No hay conexión ahora. La lista queda guardada en el dispositivo — podés reintentar publicar más tarde.'
          : `No se pudo publicar: ${err.message}`;
      statusEl.hidden = false;
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar lista de hoy';
    }
  });
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
