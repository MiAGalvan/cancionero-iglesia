// Router mínimo por hash: no hace falta una librería para estas pantallas.
// Rutas: #/library (default), #/library/:categoria,
// #/song/new, #/song/new/:categoria, #/song/:id, #/song/:id/edit,
// #/login (opcional ?returnTo=/ruta/de/vuelta),
// #/misa/nueva, #/misa/:fecha, #/publicar/:fecha, #/qr,
// #/lista-publicada, #/proyeccion, #/espacios
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
    renderNewSongView(app, { editId: parts[1] });
  } else if (parts[0] === 'song' && parts[1]) {
    renderSongView(app, { id: parts[1] });
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
