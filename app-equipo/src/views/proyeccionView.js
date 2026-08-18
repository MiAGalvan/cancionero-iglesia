// "Modo proyección": pantalla grande y de alto contraste para conectar por
// HDMI a un televisor o proyector, en vez de armar diapositivas de
// PowerPoint a mano. Muestra la MISMA lista publicada que ve la gente por
// el QR (tabla pública `lista_actual`) — así, si el equipo cambia una
// canción a mitad de la misa y vuelve a publicar, acá se actualiza sola,
// sin tocar nada en la compu conectada a la pantalla.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { getVisibleSpaces } from '../storage/auth.js';

const REFRESH_MS = 45000;

// Antes esto se armaba a mano en PowerPoint: una diapositiva por pedazo de
// canción (título + 2 estrofas más o menos), para poder avanzar pantalla
// por pantalla sin scrollear en vivo intentando llevar el ritmo del canto.
// Acá se hace lo mismo solo: cada bloque de la letra (separado por una
// línea en blanco) se va sumando a la página actual hasta pasarse de este
// límite, y ahí arranca una página nueva.
const MAX_LINES_PER_PAGE = 8;

function splitIntoPages(letra) {
  const blocks = (letra || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return [letra || ''];

  const pages = [];
  let current = [];
  let currentLines = 0;

  for (const block of blocks) {
    const blockLines = block.split('\n').length;
    if (current.length > 0 && currentLines + blockLines > MAX_LINES_PER_PAGE) {
      pages.push(current.join('\n\n'));
      current = [];
      currentLines = 0;
    }
    current.push(block);
    currentLines += blockLines;
  }
  if (current.length > 0) pages.push(current.join('\n\n'));
  return pages;
}

// De la lista de canciones publicadas a la lista real de pantallas a
// mostrar: una canción larga ocupa varias páginas seguidas, cada una con el
// mismo título (+ "parte 2/3"...) para que se note que sigue siendo la
// misma canción, no una nueva.
function buildPages(items) {
  const pages = [];
  for (const item of items) {
    const partes = splitIntoPages(item.letra_sin_acordes);
    partes.forEach((letra, i) => {
      pages.push({
        categoria: item.categoria,
        titulo_cancion: item.titulo_cancion,
        letra,
        parte: partes.length > 1 ? i + 1 : null,
        totalPartes: partes.length > 1 ? partes.length : null,
      });
    });
  }
  return pages;
}

export async function renderProyeccionView(container) {
  const spaces = await getVisibleSpaces();
  const state = {
    phase: 'setup',
    space: spaces.some((space) => space.key === getCurrentSpaceKey()) ? getCurrentSpaceKey() : spaces[0].key,
    items: [],
    pages: [],
    index: 0,
  };
  let refreshTimer = null;

  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
  }
  window.addEventListener('hashchange', stopAutoRefresh, { once: true });

  function render() {
    if (state.phase === 'setup') renderSetup();
    else renderShowing();
  }

  function renderSetup() {
    stopAutoRefresh();
    container.innerHTML = `
      <div class="topbar">
        <a class="btn" href="#/library">← Cancionero</a>
        <h2>Modo proyección</h2>
        <span></span>
      </div>
      <div class="form-view qr-view">
        <p>
          Pensado para conectar la computadora por HDMI a una pantalla o
          proyector: letra grande, alto contraste, sin acordes. Se actualiza
          sola si el equipo publica un cambio durante la misa.
        </p>
        <div class="mode-tabs" id="space-tabs">
          ${spaces.map(
            (space) => `<button type="button" class="mode-tab" data-space-tab="${space.key}">${escapeHtml(
              space.locality ? `${space.label} (${space.locality})` : space.label
            )}</button>`
          ).join('')}
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-accent proyeccion-start-btn" id="start-btn">Iniciar proyección</button>
        </div>
        <div id="setup-status" class="warning-box" hidden></div>
      </div>
    `;

    const tabButtons = container.querySelectorAll('[data-space-tab]');
    function updateTabsUI() {
      tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.spaceTab === state.space));
    }
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.space = btn.dataset.spaceTab;
        updateTabsUI();
      });
    });
    updateTabsUI();

    container.querySelector('#start-btn').addEventListener('click', async () => {
      const statusEl = container.querySelector('#setup-status');
      const ok = await loadItems();
      if (!ok) {
        statusEl.hidden = false;
        statusEl.textContent = `Todavía no hay ninguna lista publicada para ${getSpaceLabel(state.space)}.`;
        return;
      }
      state.phase = 'showing';
      state.index = 0;
      render();
      const el = container.querySelector('.proyeccion-screen');
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    });
  }

  async function loadItems() {
    if (!isSupabaseConfigured) return false;
    const { data, error } = await supabase
      .from('lista_actual')
      .select('items')
      .eq('space', state.space)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0 || !data[0].items.length) return false;
    state.items = data[0].items;
    state.pages = buildPages(state.items);
    return true;
  }

  function renderShowing() {
    const page = state.pages[state.index];
    container.innerHTML = `
      <div class="proyeccion-screen">
        <button type="button" class="proyeccion-exit" id="exit-btn" title="Salir">✕</button>
        <div class="proyeccion-categoria">${escapeHtml(page.categoria)}</div>
        <div class="proyeccion-titulo">${escapeHtml(page.titulo_cancion)}${
      page.parte ? ` <span class="proyeccion-parte">· parte ${page.parte}/${page.totalPartes}</span>` : ''
    }</div>
        <div class="proyeccion-letra">${escapeHtml(page.letra)}</div>
        <div class="proyeccion-nav">
          <button type="button" class="proyeccion-nav-btn" id="prev-btn" ${
            state.index === 0 ? 'disabled' : ''
          }>‹</button>
          <span class="proyeccion-contador">${state.index + 1} / ${state.pages.length}</span>
          <button type="button" class="proyeccion-nav-btn" id="next-btn" ${
            state.index === state.pages.length - 1 ? 'disabled' : ''
          }>›</button>
        </div>
      </div>
    `;

    container.querySelector('#exit-btn').addEventListener('click', exitProyeccion);
    container.querySelector('#prev-btn').addEventListener('click', () => goTo(state.index - 1));
    container.querySelector('#next-btn').addEventListener('click', () => goTo(state.index + 1));
  }

  function goTo(newIndex) {
    if (newIndex < 0 || newIndex >= state.pages.length) return;
    state.index = newIndex;
    renderShowing();
  }

  function exitProyeccion() {
    stopAutoRefresh();
    window.removeEventListener('keydown', onKeyDown);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    window.location.hash = '#/library';
  }

  function onKeyDown(event) {
    if (state.phase !== 'showing') return;
    if (event.key === 'ArrowRight' || event.key === ' ') goTo(state.index + 1);
    else if (event.key === 'ArrowLeft') goTo(state.index - 1);
    else if (event.key === 'Escape') exitProyeccion();
  }
  window.addEventListener('keydown', onKeyDown);

  render();

  // Cada tanto volvemos a pedir la lista publicada, por si el equipo la
  // cambió mientras tanto. Si cambió, mantenemos la MISMA categoría a la
  // vista si sigue existiendo (para no saltar a otra canción de golpe);
  // si no, volvemos a la primera.
  refreshTimer = setInterval(async () => {
    if (state.phase !== 'showing') return;
    const categoriaActual = state.pages[state.index]?.categoria;
    const parteActual = state.pages[state.index]?.parte;
    const ok = await loadItems();
    if (!ok) return;
    // Mismo criterio de antes (quedarse en la misma categoría si sigue
    // existiendo), ahora además tratando de mantener la misma parte de dentro
    // de esa canción, por si el refresco llega a mitad de una canción larga.
    const sameIndex = state.pages.findIndex(
      (page) => page.categoria === categoriaActual && (page.parte || null) === (parteActual || null)
    );
    const fallbackIndex = state.pages.findIndex((page) => page.categoria === categoriaActual);
    state.index = sameIndex >= 0 ? sameIndex : fallbackIndex >= 0 ? fallbackIndex : 0;
    renderShowing();
  }, REFRESH_MS);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
