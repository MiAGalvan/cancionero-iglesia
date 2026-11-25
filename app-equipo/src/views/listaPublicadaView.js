// Pantalla de solo lectura, sin login: muestra la misma lista que ve la
// gente al escanear el QR, pero adentro de la app del equipo — para que
// los cantores que tienen la app instalada no dependan de escanear nada.
// Usa la tabla pública `lista_actual` (lectura abierta a cualquiera, ver
// supabase/schema.sql), la misma que lee pagina-publica.
import { supabase, isSupabaseConfigured } from '../storage/supabaseClient.js';
import { getCurrentSpaceKey, getSpaceLabel } from '../storage/settings.js';
import { getVisibleSpaces } from '../storage/auth.js';
import { getSongByUuid, getAllSongs } from '../storage/db.js';
import { getSession } from '../storage/auth.js';
import { getModoLectura } from '../storage/settings.js';
import { filterSongs } from '../search/songSearch.js';
import { cambiarCancionPublicada } from '../liturgia/publicar.js';

const REFRESH_MS = 45000;

export async function renderListaPublicadaView(container) {
  const spaces = await getVisibleSpaces();
  // Para cambiar canciones hace falta poder editar (sesión iniciada y fuera
  // del modo lectura) — mismo criterio que el resto de la app.
  const puedeEditarBase = Boolean(await getSession()) && !getModoLectura();
  // Qué fila (horario) de la fecha publicada se está viendo; null = la última.
  let selectedHora = null;
  // La fila que se está mostrando ahora (para el botón "Cambiar").
  let filaActual = null;
  let avisoCambio = '';
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
        .select('fecha, hora, items, published_by')
        .eq('space', selectedSpace)
        .order('updated_at', { ascending: false })
        .limit(8),
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

    // Se muestra la lista publicada más reciente; si ese mismo día hay más de
    // un horario publicado (ej. 12:00 y 19:00), arriba se puede elegir cuál.
    const masReciente = data[0];
    const delMismoDia = data
      .filter((fila) => fila.fecha === masReciente.fecha)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    const elegida =
      selectedHora !== null ? delMismoDia.find((fila) => (fila.hora || '') === selectedHora) : null;
    const fila = elegida || masReciente;
    const { fecha, items, published_by } = fila;
    filaActual = fila;
    const puedeEditar = puedeEditarBase && selectedSpace === getCurrentSpaceKey();

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
      <p class="qr-url">${formatFecha(fecha)}${fila.hora ? ` · ${escapeHtml(fila.hora)}` : ''}</p>
      ${
        delMismoDia.length > 1
          ? `<div class="mode-tabs" id="hora-tabs">${delMismoDia
              .map(
                (f) =>
                  `<button type="button" class="mode-tab${(f.hora || '') === (fila.hora || '') ? ' active' : ''}" data-hora-tab="${escapeHtml(
                    f.hora || ''
                  )}">${f.hora ? escapeHtml(f.hora) : 'Sin horario'}</button>`
              )
              .join('')}</div>`
          : ''
      }
      ${avisoCambio ? `<p class="cambiar-aviso">${escapeHtml(avisoCambio)}</p>` : ''}
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
              ? `<a href="#/song/${local.id}?returnTo=${encodeURIComponent('/lista-publicada')}">${escapeHtml(
                  item.titulo_cancion
                )} 🎸</a>`
              : escapeHtml(item.titulo_cancion);
            return `
          <section class="publicada-cancion">
            <h3 class="publicada-categoria">${escapeHtml(item.categoria)}</h3>
            <h4 class="publicada-titulo">${tituloHtml}</h4>
            ${
              puedeEditar
                ? `<button type="button" class="btn btn-small" data-cambiar="${i}">🔁 Cambiar canción</button>`
                : ''
            }
            <p class="publicada-letra">${escapeHtml(item.letra_sin_acordes)}</p>
          </section>`;
          })
          .join('')}
      </div>
      ${renderNovedades(anuncios)}
    `;

    contentEl.querySelectorAll('[data-hora-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedHora = btn.dataset.horaTab;
        avisoCambio = '';
        load();
      });
    });
    contentEl.querySelectorAll('[data-cambiar]').forEach((btn) => {
      btn.addEventListener('click', () => iniciarCambio(fila, Number(btn.dataset.cambiar)));
    });
  }

  // Abre el buscador, y al elegir una canción la publica en el lugar de la
  // anterior (ver cambiarCancionPublicada en liturgia/publicar.js).
  async function iniciarCambio(fila, indice) {
    const anterior = fila.items[indice];
    if (!anterior) return;
    const canciones = await getAllSongs(selectedSpace);
    abrirSelectorCancion({
      categoria: anterior.categoria,
      tituloActual: anterior.titulo_cancion,
      canciones,
      onElegir: async (song) => {
        if (!confirm(`¿Cambiar "${anterior.titulo_cancion}" por "${song.title}" en la lista publicada? Se ve en el QR enseguida.`)) {
          return false;
        }
        try {
          await cambiarCancionPublicada({
            space: selectedSpace,
            fecha: fila.fecha,
            hora: fila.hora,
            anterior,
            song,
          });
          avisoCambio = `✓ Listo: "${song.title}" reemplazó a "${anterior.titulo_cancion}" y ya se ve en el QR.`;
        } catch (err) {
          console.error(err);
          avisoCambio =
            err.message === 'CANCION_YA_CAMBIADA' || err.message === 'LISTA_YA_NO_EXISTE'
              ? 'Esa lista cambió mientras la mirabas: se recargó, probá de nuevo.'
              : 'No se pudo cambiar (revisá la conexión y que hayas iniciado sesión).';
        }
        load();
        return true;
      },
    });
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
      selectedHora = null;
      avisoCambio = '';
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

// Ventana para elegir la canción nueva. Sin escribir nada muestra las de la
// misma carpeta (categoría) que la que se cambia — lo más probable es que se
// busque otra del mismo momento de la misa —; al escribir busca en TODO el
// cancionero (título, artista o letra). `onElegir(song)` devuelve true si
// ya se cambió (se cierra la ventana) o false si se canceló (sigue abierta).
function abrirSelectorCancion({ categoria, tituloActual, canciones, onElegir }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'cambiar-backdrop';
  backdrop.innerHTML = `
    <div class="cambiar-modal" role="dialog" aria-modal="true">
      <div class="cambiar-header">
        <div>
          <h3>Cambiar canción</h3>
          <p class="cambiar-sub">${escapeHtml(categoria)}: ahora está "${escapeHtml(tituloActual)}"</p>
        </div>
        <button type="button" class="btn btn-icon" id="cambiar-cerrar" aria-label="Cerrar">✕</button>
      </div>
      <input type="search" id="cambiar-buscar" placeholder="Buscar por título, artista o letra…" autocomplete="off" />
      <p class="cambiar-hint" id="cambiar-hint"></p>
      <div class="cambiar-lista" id="cambiar-lista"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const buscarEl = backdrop.querySelector('#cambiar-buscar');
  const hintEl = backdrop.querySelector('#cambiar-hint');
  const listaEl = backdrop.querySelector('#cambiar-lista');
  const MAX_RESULTADOS = 60;
  let ocupado = false;

  const cerrar = () => backdrop.remove();
  backdrop.querySelector('#cambiar-cerrar').addEventListener('click', cerrar);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) cerrar();
  });

  function pintar() {
    const consulta = buscarEl.value.trim();
    let resultados;
    if (consulta) {
      resultados = filterSongs(canciones, consulta);
      hintEl.textContent = resultados.length
        ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} en todo el cancionero`
        : 'No hay canciones con eso.';
    } else {
      resultados = canciones.filter((song) => (song.categories || []).includes(categoria));
      hintEl.textContent = resultados.length
        ? `Canciones de la carpeta ${categoria}. Escribí para buscar en todo el cancionero.`
        : 'Escribí para buscar en todo el cancionero.';
    }
    listaEl.innerHTML = resultados
      .slice(0, MAX_RESULTADOS)
      .map(
        (song, i) => `
        <button type="button" class="cambiar-item" data-i="${i}">
          <span class="cambiar-item-titulo">${escapeHtml(song.title)}</span>
          ${song.artist ? `<span class="cambiar-item-artista">${escapeHtml(song.artist)}</span>` : ''}
        </button>`
      )
      .join('');
    listaEl.querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (ocupado) return;
        ocupado = true;
        try {
          const hecho = await onElegir(resultados[Number(btn.dataset.i)]);
          if (hecho) cerrar();
        } finally {
          ocupado = false;
        }
      });
    });
  }

  buscarEl.addEventListener('input', pintar);
  pintar();
  buscarEl.focus();
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
