// Pantalla de solo lectura, sin login: muestra la misma lista que ve la
// gente al escanear el QR, pero adentro de la app del equipo — para que
// los cantores que tienen la app instalada no dependan de escanear nada.
// Usa la tabla pública `lista_actual` (lectura abierta a cualquiera, ver
// supabase/schema.sql), la misma que lee pagina-publica.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getSpaces, getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';

const REFRESH_MS = 45000;

export function renderListaPublicadaView(container) {
  let selectedSpace = getCurrentSpaceKey();
  let refreshTimer = null;

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>Lista publicada</h2>
      <span></span>
    </div>
    <div class="form-view">
      <div class="mode-tabs" id="space-tabs">
        ${getSpaces().map(
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
        .select('fecha, items')
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

    const { fecha, items } = data[0];
    contentEl.innerHTML = `
      ${logoHtml}
      <p class="qr-url">${formatFecha(fecha)}</p>
      <div class="lista-publicada">
        ${items
          .map(
            (item) => `
          <section class="publicada-cancion">
            <h3 class="publicada-categoria">${escapeHtml(item.categoria)}</h3>
            <h4 class="publicada-titulo">${escapeHtml(item.titulo_cancion)}</h4>
            <p class="publicada-letra">${escapeHtml(item.letra_sin_acordes)}</p>
          </section>`
          )
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
