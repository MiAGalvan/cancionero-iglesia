// "Modo ensayo": ver una lista de misa GUARDADA (publicada o no) de punta a
// punta, con acordes — para no tener que ir canción por canción entrando y
// saliendo de las carpetas del cancionero en cada ensayo, y sin pisar la
// lista que ya esté publicada (esto no publica nada, solo LEE lo guardado).
//
// A propósito muestra los acordes (a diferencia de la página pública del
// QR, que los saca): sirve también para quien no tiene sesión iniciada —
// ver el cancionero completo con acordes normalmente pide estar logueado,
// esto no.
import { getMisa, getSong } from '../storage/db.js';
import { getAllCategories, getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { tituloMisa } from './misaListView.js';

export async function renderEnsayoView(container, { fecha, hora = '' }) {
  const space = getCurrentSpaceKey();
  const volverHref = `#/misa/${fecha}/${encodeURIComponent(hora)}`;
  const misa = await getMisa(space, fecha, hora);

  if (!misa || Object.keys(misa.items || {}).length === 0) {
    container.innerHTML = `
      <div class="topbar">
        <a class="btn" href="${volverHref}">← Lista de misa</a>
        <h2>Ensayo</h2>
        <span></span>
      </div>
      <div class="empty-state">Todavía no armaste esta lista. <a href="${volverHref}">Armarla ahora</a>.</div>
    `;
    return;
  }

  const categories = getAllCategories(space);
  const secciones = [];
  for (const categoria of categories) {
    const valor = misa.items[categoria];
    const songIds = Array.isArray(valor) ? valor : valor ? [valor] : [];
    for (const songId of songIds) {
      const song = await getSong(songId);
      if (song) secciones.push({ categoria, song });
    }
  }

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="${volverHref}">← Lista de misa</a>
      <h2>Ensayo — ${escapeHtml(tituloMisa(fecha, hora))} — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view ensayo-view">
      ${
        misa.asignados?.length
          ? `<p class="chord-editor-hint">👥 ${escapeHtml(misa.asignados.join(', '))}</p>`
          : ''
      }
      ${
        secciones.length === 0
          ? `<div class="empty-state">No hay ninguna canción elegida todavía en esta lista.</div>`
          : secciones
              .map(
                ({ categoria, song }, i) => `
        <section class="ensayo-cancion">
          <h3 class="ensayo-categoria">${escapeHtml(categoria)}</h3>
          <h2 class="ensayo-titulo">${escapeHtml(song.title)}${song.artist ? ` <span class="ensayo-artista">— ${escapeHtml(song.artist)}</span>` : ''}</h2>
          <div class="lyrics-container ensayo-letra" id="ensayo-letra-${i}"></div>
        </section>`
              )
              .join('')
      }
    </div>
  `;

  secciones.forEach(({ song }, i) => {
    const el = container.querySelector(`#ensayo-letra-${i}`);
    if (el) el.innerHTML = renderSong(parseChordPro(song.chordpro));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
