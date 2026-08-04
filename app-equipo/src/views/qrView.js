// Pantalla para generar el QR de la página pública, UNA sola vez por
// parroquia: se imprime o se muestra pegado en algún lugar de la iglesia y
// no vuelve a cambiar — lo que cambia es el contenido publicado detrás de
// esa URL (ver publicarView.js / pagina-publica). Cada espacio (parroquia)
// tiene su propio QR, porque cada uno tiene su propia lista publicada.
import QRCode from 'qrcode';
import { getSpaces, getCurrentSpaceKey } from '../storage/settings.js';

// ⚠️ COMPLETAR: la URL fija de la página pública, una vez que esté
// desplegada (ej. "https://tu-usuario.github.io/cancionero-iglesia/" o la
// URL de Netlify que le hayas puesto a pagina-publica).
const PUBLIC_URL = 'https://cute-donut-4f119e.netlify.app/';

export function renderQrView(container) {
  const isConfigured = !PUBLIC_URL.includes('TU-USUARIO');
  let selectedSpace = getCurrentSpaceKey();

  container.innerHTML = `
    <div class="topbar">
      <a class="btn" href="#/library">← Cancionero</a>
      <h2>QR de la lista de misa</h2>
      <span></span>
    </div>
    <div class="form-view qr-view">
      ${
        isConfigured
          ? ''
          : `<div class="warning-box">
              Falta poner la URL definitiva de la página pública en
              <code>src/views/qrView.js</code> (constante <code>PUBLIC_URL</code>),
              una vez que esté publicada.
            </div>`
      }
      <p>
        Cada parroquia tiene su propio QR — elegí para cuál generarlo. Se
        imprime o se pega en algún lugar visible <strong>una sola vez</strong>:
        siempre apunta a la misma dirección, lo que cambia con cada misa es
        el contenido que el equipo publica, no el QR.
      </p>
      <div class="mode-tabs" id="space-tabs">
        ${getSpaces().map(
          (space) => `<button type="button" class="mode-tab" data-space-tab="${space.key}">${escapeHtml(
            space.locality ? `${space.label} (${space.locality})` : space.label
          )}</button>`
        ).join('')}
      </div>
      <div class="qr-canvas-wrap">
        <canvas id="qr-canvas"></canvas>
      </div>
      <p class="qr-url" id="qr-url"></p>
    </div>
  `;

  const canvas = container.querySelector('#qr-canvas');
  const urlEl = container.querySelector('#qr-url');
  const tabButtons = container.querySelectorAll('[data-space-tab]');

  function render() {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.spaceTab === selectedSpace);
    });
    const url = `${PUBLIC_URL}?space=${encodeURIComponent(selectedSpace)}`;
    urlEl.textContent = url;
    QRCode.toCanvas(canvas, url, { width: 320, margin: 2 }, (err) => {
      if (err) console.error('No se pudo generar el QR:', err);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSpace = btn.dataset.spaceTab;
      render();
    });
  });

  render();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
