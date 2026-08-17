// Pantalla de solo lectura, sin login: muestra la misma lista que ve la
// gente al escanear el QR, pero adentro de la app del equipo — para que
// los cantores que tienen la app instalada no dependan de escanear nada.
// Usa la tabla pública `lista_actual` (lectura abierta a cualquiera, ver
// supabase/schema.sql), la misma que lee pagina-publica.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { getVisibleSpaces } from '../storage/auth.js';
import { getSongByUuid } from '../storage/db.js';

const REFRESH_MS = 45000;

export async function renderListaPublicadaView(container) {
  const spaces = await getVisibleSpaces();
  let selectedSpace = spaces.some((space) => space.key === getCurrentSpaceKey())
    ? getCurrentSpaceKey()
    : spaces[0].key;
  let refreshTimer = null;

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Lista publicada</h2>
      <span></span>
    </div>
    <div class="form-view">
      <div class="mode-tabs" id="space-tabs">
        ${spaces.map(
          (space) => `<button type="button" class="mode-tab" data-space-tab="${space.key}">${escapeHtml(
            space.locality ? `${space.label} (${space.locality})` : space.label
          )}</button>`
        ).join('')}
      </div>
      <div id="lista-content"></div>
    </div>
  `;

  const contentEl = container.querySelector('#lista-content');
  const tabButtons = container.querySelectorAll('[data-space-tab]');

  function updateTabsUI() {
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.spaceTab === selectedSpace));
  }

  async function load() {
    if (!isSupabaseConfigured) {
      contentEl.innerHTML = `<div class="warning-box">Falta configurar Supabase.</div>`;
      return;
    }
    const [listaResult, anunciosResult, logoResult] = await Promise.all([
      supabase
        .from('lista_actual')
        .select('fecha, items, published_by')
        .eq('space', selectedSpace)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('anuncios')
        .select('titulo, cuerpo')
        .eq('space', selectedSpace)
        .order('updated_at', { ascending: false }),
      supabase.from('espacio_logos').select('logo_url').eq('space', selectedSpace).maybeSingle(),
    ]);

    const { data, error } = listaResult;
    const anuncios = anunciosResult.error ? [] : anunciosResult.data;
    const logoHtml = logoResult.error || !logoResult.data?.logo_url
      ? ''
      : `<div class="parish-banner"><img src="${escapeHtml(logoResult.data.logo_url)}" alt="" /></div>`;

    if (error) {
      contentEl.innerHTML = `<div class="warning-box">No se pudo cargar (revisá la conexión).</div>`;
      return;
    }
    if (!data || data.length === 0) {
      contentEl.innerHTML = `
        ${logoHtml}
        <div class="empty-state">Todavía no se publicó ninguna lista para ${escapeHtml(
          getSpaceLabel(selectedSpace)
        )}.</div>
        ${renderNovedades(anuncios)}
      `;
      return;
    }

    const { fecha, items, published_by } = data[0];

    // Si la canción publicada existe en el cancionero de ESTE dispositivo
    // (se busca por uuid, el mismo id que usa la sincronización), el título
    // se convierte en un link directo a la vista con acordes, transporte y
    // autoscroll — así quien está tocando no tiene que salir a buscarla a
    // mano por las carpetas. Si no está localmente (por ejemplo, mirando la
    // lista de otra parroquia), se queda como texto plano nomás, sin
    // romperse. Nunca se toca la tabla `songs` (con acordes) desde este
    // dispositivo si no la tiene ya — no se descarga nada nuevo acá.
    const localMatches = await Promise.all(
      items.map((item) => (item.song_uuid ? getSongByUuid(item.song_uuid) : null))
    );

    contentEl.innerHTML = `
      ${logoHtml}
      <p class="qr-url">${formatFecha(fecha)}</p>
      ${
        published_by
          ? `<p class="publicada-por">Publicado por ${escapeHtml(published_by)}</p>`
          : ''
      }
      <div class="lista-publicada">
        ${items
          .map((item, i) => {
            const local = localMatches[i];
            const tituloHtml = local
              ? `<a href="#/song/${local.id}">${escapeHtml(item.titulo_cancion)} 🎸</a>`
              : escapeHtml(item.titulo_cancion);
            return `
          <section class="publicada-cancion">
            <h3 class="publicada-categoria">${escapeHtml(item.categoria)}</h3>
            <h4 class="publicada-titulo">${tituloHtml}</h4>
            <p class="publicada-letra">${escapeHtml(item.letra_sin_acordes)}</p>
          </section>`;
          })
          .join('')}
      </div>
      ${renderNovedades(anuncios)}
    `;
  }

  function renderNovedades(anuncios) {
    if (!anuncios || anuncios.length === 0) return '';
    return `
      <div class="lista-publicada novedades">
        <h3 class="novedades-titulo">Novedades</h3>
        ${anuncios
          .map(
            (anuncio) => `
          <section class="publicada-cancion novedad">
            <h4 class="publicada-titulo">${escapeHtml(anuncio.titulo)}</h4>
            <p class="publicada-letra">${escapeHtml(anuncio.cuerpo)}</p>
          </section>`
          )
          .join('')}
      </div>
    `;
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSpace = btn.dataset.spaceTab;
      updateTabsUI();
      load();
    });
  });

  updateTabsUI();
  load();

  // Se refresca sola por si el equipo publica un cambio de último momento
  // durante la misa. Se corta apenas se navega a otra pantalla, para no
  // dejar pedidos de red corriendo en segundo plano sin sentido.
  refreshTimer = setInterval(load, REFRESH_MS);
  window.addEventListener('hashchange', () => clearInterval(refreshTimer), { once: true });
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
