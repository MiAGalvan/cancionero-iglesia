// "Biblioteca compartida": canciones que OTRAS parroquias marcaron como
// "Compartir con otras parroquias" (ver newSongView.js). Sirve para no
// tipear/pegar de nuevo una canción que otro equipo ya cargó — se copia tal
// cual a tu propio cancionero (nueva canción local, independiente: después
// la podés editar sin afectar a la original de la otra parroquia).
// Requiere sesión iniciada (la tabla `songs` no tiene lectura pública, ni
// siquiera para lo compartido — es "entre equipos", no para cualquiera).
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSession } from '../storage/auth.js';
import { saveSong } from '../storage/db.js';
import { syncNow } from '../storage/sync.js';
import { getCurrentSpaceKey } from '../storage/settings.js';

export async function renderCompartidasView(container) {
  const space = getCurrentSpaceKey();
  const session = await getSession();
  const loggedIn = Boolean(session);

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Biblioteca compartida</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        Canciones que otras parroquias marcaron como "Compartir con otras
        parroquias". Copiala a tu cancionero en vez de tipearla de nuevo —
        queda como una canción propia, independiente, que después podés
        editar sin afectar a la original.
      </p>
      ${
        !isSupabaseConfigured
          ? `<div class="warning-box">Falta configurar Supabase en <code>src/storage/supabaseClient.js</code>.</div>`
          : !loggedIn
          ? `<div class="warning-box">
              Iniciá sesión para ver y copiar canciones compartidas.
              <a href="#/login?returnTo=${encodeURIComponent('/compartidas')}">Ingresar</a>
            </div>`
          : ''
      }
      ${
        loggedIn
          ? `<input type="text" id="search-input" placeholder="Buscar por título o artista..." />`
          : ''
      }
      <div id="compartidas-status" class="warning-box" hidden></div>
      <ul class="song-list" id="compartidas-list"></ul>
    </div>
  `;

  if (!loggedIn || !isSupabaseConfigured) return;

  const listEl = container.querySelector('#compartidas-list');
  const statusEl = container.querySelector('#compartidas-status');
  const searchInput = container.querySelector('#search-input');
  let songs = [];

  function showError(err) {
    statusEl.textContent = `No se pudo copiar: ${err?.message || err}`;
    statusEl.hidden = false;
  }

  function renderList(query) {
    const needle = (query || '').trim().toLowerCase();
    const filtered = needle
      ? songs.filter(
          (song) =>
            song.title.toLowerCase().includes(needle) || (song.artist || '').toLowerCase().includes(needle)
        )
      : songs;

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${
        songs.length === 0
          ? 'Todavía ninguna otra parroquia compartió canciones.'
          : 'Ninguna coincide con la búsqueda.'
      }</li>`;
      return;
    }

    listEl.innerHTML = filtered.map(songItemHtml).join('');
  }

  function songItemHtml(song) {
    return `
      <li class="song-item" data-uuid="${escapeAttr(song.uuid)}">
        <span>
          ${escapeHtml(song.title)}${song.artist ? ` — <span class="song-artist">${escapeHtml(song.artist)}</span>` : ''}
          <span class="song-artist">Compartida por ${escapeHtml(song.space_name || song.space)}</span>
        </span>
        <button type="button" class="btn btn-accent" data-copy="${escapeAttr(song.uuid)}">Copiar a mi cancionero</button>
      </li>`;
  }

  const { data, error } = await supabase
    .from('songs')
    .select('uuid, title, artist, categories, chordpro, space, space_name')
    .eq('shared', true)
    .neq('space', space)
    .is('deleted_at', null)
    .order('title', { ascending: true });

  if (error) {
    listEl.innerHTML = `<li class="empty-state">No se pudo cargar (revisá la conexión).</li>`;
    return;
  }
  songs = data || [];
  renderList('');

  searchInput.addEventListener('input', () => renderList(searchInput.value));

  listEl.addEventListener('click', async (event) => {
    const uuid = event.target.dataset.copy;
    if (!uuid) return;
    const song = songs.find((s) => s.uuid === uuid);
    if (!song) return;

    event.target.disabled = true;
    event.target.textContent = 'Copiando...';
    try {
      await saveSong({
        title: song.title,
        artist: song.artist || '',
        categories: song.categories || [],
        chordpro: song.chordpro,
        space,
      });
      event.target.textContent = '✓ Copiada';
      syncNow();
    } catch (err) {
      showError(err);
      event.target.disabled = false;
      event.target.textContent = 'Copiar a mi cancionero';
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
