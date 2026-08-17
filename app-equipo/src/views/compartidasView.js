// "Biblioteca compartida": canciones que OTRAS parroquias marcaron como
// "Compartir con otras parroquias" (ver newSongView.js). Sirve para no
// tipear/pegar de nuevo una canción que otro equipo ya cargó — se copia tal
// cual a tu propio cancionero (nueva canción local, independiente: después
// la podés editar sin afectar a la original de la otra parroquia).
// Requiere sesión iniciada (la tabla `songs` no tiene lectura pública, ni
// siquiera para lo compartido — es "entre equipos", no para cualquiera).
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSession, isAdmin } from '../storage/auth.js';
import { saveSong } from '../storage/db.js';
import { syncNow } from '../storage/sync.js';
import { getCurrentSpaceKey, getChordNotation } from '../storage/settings.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { getRecordingsForSong } from '../storage/recordings.js';

export async function renderCompartidasView(container) {
  const space = getCurrentSpaceKey();
  const session = await getSession();
  const loggedIn = Boolean(session);
  // El admin (acceso a todas las parroquias, ver team_members) ve TODO el
  // cancionero de todas las parroquias acá, no solo lo marcado "compartir"
  // — así tiene un único lugar para ver o copiar cualquier canción de
  // cualquier parroquia. El resto del equipo sigue viendo solo lo que cada
  // parroquia decidió compartir a propósito.
  const admin = loggedIn && (await isAdmin());

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>${admin ? 'Todas las canciones (todas las parroquias)' : 'Biblioteca compartida'}</h2>
      <span></span>
    </div>
    <div class="form-view">
      <p class="chord-editor-hint">
        ${
          admin
            ? 'Como admin, ves acá el cancionero completo de todas las parroquias — no solo lo que marcaron compartir. Copiala a tu cancionero en vez de tipearla de nuevo: queda como una canción propia, independiente, que después podés editar sin afectar a la original de esa parroquia.'
            : `Canciones que otras parroquias marcaron como "Compartir con otras
        parroquias". Copiala a tu cancionero en vez de tipearla de nuevo —
        queda como una canción propia, independiente, que después podés
        editar sin afectar a la original.`
        }
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
        songs.length > 0
          ? 'Ninguna coincide con la búsqueda.'
          : admin
          ? 'Todavía no hay canciones cargadas en otras parroquias.'
          : 'Todavía ninguna otra parroquia compartió canciones.'
      }</li>`;
      return;
    }

    listEl.innerHTML = filtered.map(songItemHtml).join('');
  }

  function songItemHtml(song) {
    return `
      <li class="song-item compartida-item" data-uuid="${escapeAttr(song.uuid)}">
        <div class="compartida-item-row">
          <span>
            ${escapeHtml(song.title)}${song.artist ? ` — <span class="song-artist">${escapeHtml(song.artist)}</span>` : ''}
            <span class="song-artist">${admin ? 'De' : 'Compartida por'} ${escapeHtml(song.space_name || song.space)}</span>
          </span>
          <button type="button" class="btn btn-icon" data-preview="${escapeAttr(song.uuid)}" title="Ver letra y acordes">👁</button>
          <button type="button" class="btn btn-icon" data-audios="${escapeAttr(song.uuid)}" title="Escuchar cómo la canta cada grupo">🎧</button>
          <button type="button" class="btn btn-accent" data-copy="${escapeAttr(song.uuid)}">Copiar a mi cancionero</button>
        </div>
        <div class="compartida-preview" id="preview-${escapeAttr(song.uuid)}" hidden></div>
        <div class="compartida-audios" id="audios-${escapeAttr(song.uuid)}" hidden></div>
      </li>`;
  }

  async function toggleAudios(uuid, button) {
    const audiosEl = listEl.querySelector(`#audios-${CSS.escape(uuid)}`);
    if (!audiosEl) return;
    const opening = audiosEl.hidden;
    if (opening) {
      audiosEl.innerHTML = '<p class="compartida-audios-loading">Buscando grabaciones...</p>';
      audiosEl.hidden = false;
      button.disabled = true;
      const recordings = await getRecordingsForSong(uuid);
      button.disabled = false;
      audiosEl.innerHTML = recordings.length
        ? recordings
            .map(
              (rec) => `
          <div class="compartida-audio">
            <p class="compartida-audio-label">🎧 Audio de ${escapeHtml(rec.spaceName || '')} — ${escapeHtml(
                rec.groupName
              )}</p>
            <audio controls src="${escapeAttr(rec.url)}"></audio>
          </div>`
            )
            .join('')
        : '<p class="compartida-audios-loading">Todavía nadie grabó esta canción.</p>';
    } else {
      audiosEl.hidden = true;
    }
  }

  function togglePreview(uuid, button) {
    const previewEl = listEl.querySelector(`#preview-${CSS.escape(uuid)}`);
    if (!previewEl) return;
    const opening = previewEl.hidden;
    if (opening) {
      const song = songs.find((s) => s.uuid === uuid);
      const parsed = parseChordPro(song.chordpro);
      previewEl.innerHTML = `<div class="lyrics-container compartida-lyrics">${renderSong(parsed, 0, getChordNotation())}</div>`;
    } else {
      previewEl.innerHTML = '';
    }
    previewEl.hidden = !opening;
    button.textContent = opening ? '🙈' : '👁';
    button.title = opening ? 'Ocultar letra' : 'Ver letra y acordes';
  }

  let query = supabase
    .from('songs')
    .select('uuid, title, artist, categories, chordpro, space, space_name')
    .neq('space', space)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  if (!admin) query = query.eq('shared', true);

  const { data, error } = await query;

  if (error) {
    listEl.innerHTML = `<li class="empty-state">No se pudo cargar (revisá la conexión).</li>`;
    return;
  }
  songs = data || [];
  renderList('');

  searchInput.addEventListener('input', () => renderList(searchInput.value));

  listEl.addEventListener('click', async (event) => {
    const previewUuid = event.target.dataset.preview;
    if (previewUuid) {
      togglePreview(previewUuid, event.target);
      return;
    }

    const audiosUuid = event.target.dataset.audios;
    if (audiosUuid) {
      toggleAudios(audiosUuid, event.target);
      return;
    }

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
