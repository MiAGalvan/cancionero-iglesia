// "Modo proyección": pantalla grande y de alto contraste para conectar por
// HDMI a un televisor o proyector, en vez de armar diapositivas de
// PowerPoint a mano. Muestra la MISMA lista publicada que ve la gente por
// el QR (tabla pública `lista_actual`) — así, si el equipo cambia una
// canción a mitad de la misa y vuelve a publicar, acá se actualiza sola,
// sin tocar nada en la compu conectada a la pantalla.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { SPACES, getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';

const REFRESH_MS = 45000;

export function renderProyeccionView(container) {
  const state = {
    phase: 'setup',
    space: getCurrentSpaceKey(),
    items: [],
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
          ${SPACES.map(
            (space) => `<button type="button" class="mode-tab" data-space-tab="${space.key}">${escapeHtml(
              space.label
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
      .order('fecha', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0 || !data[0].items.length) return false;
    state.items = data[0].items;
    return true;
  }

  function renderShowing() {
    const item = state.items[state.index];
    container.innerHTML = `
      <div class="proyeccion-screen">
        <button type="button" class="proyeccion-exit" id="exit-btn" title="Salir">✕</button>
        <div class="proyeccion-categoria">${escapeHtml(item.categoria)}</div>
        <div class="proyeccion-titulo">${escapeHtml(item.titulo_cancion)}</div>
        <div class="proyeccion-letra">${escapeHtml(item.letra_sin_acordes)}</div>
        <div class="proyeccion-nav">
          <button type="button" class="proyeccion-nav-btn" id="prev-btn" ${
            state.index === 0 ? 'disabled' : ''
          }>‹</button>
          <span class="proyeccion-contador">${state.index + 1} / ${state.items.length}</span>
          <button type="button" class="proyeccion-nav-btn" id="next-btn" ${
            state.index === state.items.length - 1 ? 'disabled' : ''
          }>›</button>
        </div>
      </div>
    `;

    container.querySelector('#exit-btn').addEventListener('click', exitProyeccion);
    container.querySelector('#prev-btn').addEventListener('click', () => goTo(state.index - 1));
    container.querySelector('#next-btn').addEventListener('click', () => goTo(state.index + 1));
  }

  function goTo(newIndex) {
    if (newIndex < 0 || newIndex >= state.items.length) return;
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
    const categoriaActual = state.items[state.index]?.categoria;
    const ok = await loadItems();
    if (!ok) return;
    const sameIndex = state.items.findIndex((item) => item.categoria === categoriaActual);
    state.index = sameIndex >= 0 ? sameIndex : 0;
    renderShowing();
  }, REFRESH_MS);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
