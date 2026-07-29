// Pantalla para generar el QR de la página pública, UNA sola vez: se imprime
// o se muestra pegado en algún lugar de la iglesia y no vuelve a cambiar —
// lo que cambia es el contenido publicado detrás de esa URL (ver
// publicarView.js / pagina-publica).
import QRCode from 'qrcode';

// ⚠️ COMPLETAR: la URL fija de la página pública, una vez que esté
// desplegada en GitHub Pages (ej. "https://tu-usuario.github.io/cancionero-iglesia/").
const PUBLIC_URL = 'https://TU-USUARIO.github.io/cancionero-iglesia/';

export function renderQrView(container) {
  const isConfigured = !PUBLIC_URL.includes('TU-USUARIO');

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
              una vez que esté publicada en GitHub Pages.
            </div>`
      }
      <p>
        Este QR se imprime o se pega en algún lugar visible <strong>una sola vez</strong>.
        Siempre apunta a la misma dirección — lo que cambia con cada misa es el
        contenido que el equipo publica, no el QR.
      </p>
      <div class="qr-canvas-wrap">
        <canvas id="qr-canvas"></canvas>
      </div>
      <p class="qr-url">${escapeHtml(PUBLIC_URL)}</p>
    </div>
  `;

  const canvas = container.querySelector('#qr-canvas');
  QRCode.toCanvas(canvas, PUBLIC_URL, { width: 320, margin: 2 }, (err) => {
    if (err) console.error('No se pudo generar el QR:', err);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
