// Router mínimo por hash: no hace falta una librería para estas pantallas.
// Rutas: #/library (default), #/library/:categoria,
// #/song/new, #/song/new/:categoria, #/song/:id, #/song/:id/edit,
// #/login (opcional ?returnTo=/ruta/de/vuelta),
// #/misa/nueva, #/misa/:fecha, #/publicar/:fecha, #/qr,
// #/lista-publicada, #/proyeccion, #/espacios, #/novedades, #/compartidas,
// #/afinador
import './styles.css';
import { renderLibraryView } from './views/libraryView.js';
import { renderNewSongView } from './views/newSongView.js';
import { renderSongView } from './views/songView.js';
import { renderLoginView } from './views/loginView.js';
import { renderMisaListView } from './views/misaListView.js';
import { renderPublicarView } from './views/publicarView.js';
import { renderQrView } from './views/qrView.js';
import { renderListaPublicadaView } from './views/listaPublicadaView.js';
import { renderProyeccionView } from './views/proyeccionView.js';
import { renderEspaciosView } from './views/espaciosView.js';
import { renderNovedadesView } from './views/novedadesView.js';
import { renderCompartidasView } from './views/compartidasView.js';
import { renderTunerView } from './views/tunerView.js';

const app = document.getElementById('app');

function router() {
  const hash = window.location.hash || '#/library';
  const [pathPart, queryPart] = hash.replace(/^#\//, '').split('?');
  const parts = pathPart.split('/').map(decodeURIComponent);
  const params = new URLSearchParams(queryPart || '');

  if (parts[0] === 'login') {
    const returnTo = params.get('returnTo');
    renderLoginView(app, { returnTo: returnTo ? `#${returnTo}` : undefined });
  } else if (parts[0] === 'song' && parts[1] === 'new') {
    renderNewSongView(app, { presetCategory: parts[2] });
  } else if (parts[0] === 'song' && parts[2] === 'edit') {
    const returnTo = params.get('returnTo');
    renderNewSongView(app, { editId: parts[1], returnTo: returnTo ? `#${returnTo}` : undefined });
  } else if (parts[0] === 'song' && parts[1]) {
    const returnTo = params.get('returnTo');
    renderSongView(app, { id: parts[1], returnTo: returnTo ? `#${returnTo}` : undefined });
  } else if (parts[0] === 'misa' && parts[1] === 'nueva') {
    renderMisaListView(app, {});
  } else if (parts[0] === 'misa' && parts[1]) {
    renderMisaListView(app, { fecha: parts[1] });
  } else if (parts[0] === 'publicar' && parts[1]) {
    renderPublicarView(app, { fecha: parts[1] });
  } else if (parts[0] === 'qr') {
    renderQrView(app);
  } else if (parts[0] === 'lista-publicada') {
    renderListaPublicadaView(app);
  } else if (parts[0] === 'proyeccion') {
    renderProyeccionView(app);
  } else if (parts[0] === 'espacios') {
    renderEspaciosView(app);
  } else if (parts[0] === 'novedades') {
    renderNovedadesView(app);
  } else if (parts[0] === 'compartidas') {
    renderCompartidasView(app);
  } else if (parts[0] === 'afinador') {
    renderTunerView(app);
  } else if (parts[0] === 'library' && parts[1]) {
    renderLibraryView(app, { category: parts[1] });
  } else {
    renderLibraryView(app);
  }
}

window.addEventListener('hashchange', router);
router();

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.error('No se pudo registrar el service worker:', err);
      });
    });
  } else {
    // En desarrollo, los archivos se sirven siempre con la misma URL (no
    // tienen un hash que cambie con el contenido, como sí pasa en el build
    // de producción). Si el Service Worker cachea esa URL en "cache-first",
    // sigue sirviendo la versión vieja para siempre aunque el código cambie
    // en disco, y parece que la app "se rompió" o dejó de andar algo que en
    // realidad ya arreglamos. Por eso, mientras desarrollamos, nos
    // aseguramos de no tener ningún Service Worker ni caché activos.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if ('caches' in window) {
      caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
    }
  }
}

// --- Avisar cuando hay una versión nueva publicada -----------------------
// No alcanza con que el Service Worker esté registrado: como
// service-worker.js no cambia de contenido de un despliegue a otro (solo
// cambian los archivos que él sirve), el navegador no tiene ninguna señal
// para darse cuenta solo de que hay algo nuevo — por eso a veces la app
// tarda en "verse" actualizada en otros dispositivos aunque ya esté
// publicada. Acá comparamos directamente el index.html real (sin caché)
// contra el que ya tenemos cargado, cada vez que se abre la app o se
// vuelve a ella después de tenerla en segundo plano — si cambió, avisamos
// con un cartel en vez de recargar solos (para no perder algo a medio
// escribir).
if (import.meta.env.PROD) {
  let currentHtml = null;

  function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      Hay una versión nueva de la app.
      <button type="button" id="update-banner-btn" class="btn btn-accent">Actualizar</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('#update-banner-btn').addEventListener('click', () => window.location.reload());
  }

  async function checkForUpdate() {
    try {
      const res = await fetch('/index.html', { cache: 'no-store' });
      const html = await res.text();
      if (currentHtml === null) {
        currentHtml = html;
        return;
      }
      if (html !== currentHtml) showUpdateBanner();
    } catch {
      // Sin conexión, o falló el pedido: no pasa nada, se reintenta solo la
      // próxima vez que se dispare el chequeo.
    }
  }

  checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  setInterval(checkForUpdate, 10 * 60 * 1000); // cada 10 min, por si queda abierta mucho rato
}
