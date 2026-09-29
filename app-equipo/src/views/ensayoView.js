// "Modo ensayo": ver una lista de misa GUARDADA (publicada o no) de punta a
// punta, con acordes — para no tener que ir canción por canción entrando y
// saliendo de las carpetas del cancionero en cada ensayo, y sin pisar la
// lista que ya esté publicada (esto no publica nada, solo LEE lo guardado).
//
// A propósito muestra los acordes (a diferencia de la página pública del
// QR, que los saca): sirve también para quien no tiene sesión iniciada —
// ver el cancionero completo con acordes normalmente pide estar logueado,
// esto no.
//
// Dos fuentes posibles, en este orden:
//  1) Local (IndexedDB de este dispositivo) — lo de siempre, con ids
//     locales de canción.
//  2) Si acá no hay nada (ej. este dispositivo nunca inició sesión y nunca
//     sincronizó, pero OTRO del equipo sí armó y sincronizó esta lista):
//     se busca en Supabase SIN sesión (getMisaSinSesion, solo lectura) —
//     ahí los ids vienen como uuid, se resuelven primero contra el
//     cancionero LOCAL (por si ya lo tiene sincronizado) y si no, contra el
//     cancionero PÚBLICO (storage/publicCancionero.js, también sin
//     sesión) — mismo criterio de dos pasos que ya usa songView.js.
import { getMisa, getSong, getSongByUuid } from '../storage/db.js';
import { getAllCategories, getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { getMisaSinSesion } from '../storage/misasSync.js';
import { getPublicSongByUuid } from '../storage/publicCancionero.js';
import { parseChordPro, renderSong } from '../viewer/songViewer.js';
import { tituloMisa } from './misaListView.js';

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export async function renderEnsayoView(container, { fecha, hora = '' }) {
  const space = getCurrentSpaceKey();
  const volverHref = `#/misa/${fecha}/${encodeURIComponent(hora)}`;
  const categories = getAllCategories(space);

  const misaLocal = await getMisa(space, fecha, hora);
  let asignados = misaLocal?.asignados || [];
  const secciones = [];

  if (misaLocal && Object.keys(misaLocal.items || {}).length > 0) {
    for (const categoria of categories) {
      for (const songId of toArray(misaLocal.items[categoria])) {
        const song = await getSong(songId);
        if (song) secciones.push({ categoria, song });
      }
    }
  } else {
    const remota = await getMisaSinSesion(space, fecha, hora);
    if (remota) {
      asignados = remota.asignados || [];
      for (const categoria of categories) {
        for (const uuid of toArray(remota.items?.[categoria])) {
          const song = (await getSongByUuid(uuid)) || (await getPublicSongByUuid(uuid));
          if (song) secciones.push({ categoria, song });
        }
      }
    }
  }

  if (!misaLocal && secciones.length === 0) {
    container.innerHTML = `
      <div class="topbar">
        <a class="btn" href="${volverHref}">← Lista de misa</a>
        <h2>Ensayo</h2>
        <span></span>
      </div>
      <div class="empty-state">Todavía no hay ninguna canción elegida para esta lista. <a href="${volverHref}">Armarla ahora</a>.</div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="${volverHref}">← Lista de misa</a>
      <h2>Ensayo — ${escapeHtml(tituloMisa(fecha, hora))} — ${escapeHtml(getSpaceLabel(space))}</h2>
      <span></span>
    </div>
    <div class="form-view ensayo-view">
      ${asignados.length ? `<p class="chord-editor-hint">👥 ${escapeHtml(asignados.join(', '))}</p>` : ''}
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
