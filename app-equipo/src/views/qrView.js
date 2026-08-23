// Pantalla para generar el QR de la página pública, UNA sola vez por
// parroquia: se imprime o se muestra pegado en algún lugar de la iglesia y
// no vuelve a cambiar — lo que cambia es el contenido publicado detrás de
// esa URL (ver publicarView.js / pagina-publica). Cada espacio (parroquia)
// tiene su propio QR, porque cada uno tiene su propia lista publicada.
import QRCode from 'qrcode';
import { getCurrentSpaceKey } from '../storage/settings.js';
import { getVisibleSpaces } from '../storage/auth.js';

// ⚠️ COMPLETAR: la URL fija de la página pública, una vez que esté
// desplegada (ej. "https://tu-usuario.github.io/cancionero-iglesia/" o la
// URL de Vercel que le hayas puesto a pagina-publica).
export const PUBLIC_URL = 'https://cancionero-iglesia-qk5n.vercel.app/';

export async function renderQrView(container) {
  const isConfigured = !PUBLIC_URL.includes('TU-USUARIO');
  const spaces = await getVisibleSpaces();
  let selectedSpace = spaces.some((space) => space.key === getCurrentSpaceKey())
    ? getCurrentSpaceKey()
    : spaces[0].key;

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
        ${spaces.map(
          (space) => `<button type="button" class="mode-tab" data-space-tab="${space.key}">${escapeHtml(
            space.locality ? `${space.label} (${space.locality})` : space.label
          )}</button>`
        ).join('')}
      </div>
      <div class="qr-canvas-wrap">
        <canvas id="qr-canvas"></canvas>
      </div>
      <p class="qr-url" id="qr-url"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-accent" id="share-btn">📤 Compartir el link</button>
        <span class="qr-share-status" id="share-status" hidden></span>
      </div>
      <p class="chord-editor-hint">
        Por si alguien no puede escanear el QR (cámara rota, poca luz, etc.):
        mandale este link directo por WhatsApp, mail o como prefieras — abre
        la misma lista.
      </p>
    </div>
  `;

  const canvas = container.querySelector('#qr-canvas');
  const urlEl = container.querySelector('#qr-url');
  const tabButtons = container.querySelectorAll('[data-space-tab]');
  const shareBtn = container.querySelector('#share-btn');
  const shareStatusEl = container.querySelector('#share-status');
  let currentUrl = '';

  function render() {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.spaceTab === selectedSpace);
    });
    const spaceLabel = spaces.find((space) => space.key === selectedSpace)?.label || '';
    currentUrl = `${PUBLIC_URL}?space=${encodeURIComponent(selectedSpace)}`;
    urlEl.textContent = currentUrl;
    shareStatusEl.hidden = true;
    // "H" (la corrección de errores más alta) es lo que permite tapar el
    // centro con el nombre de la parroquia sin que el QR deje de
    // escanear — tolera hasta ~30% del código dañado/tapado, y acá
    // ocupamos bastante menos que eso.
    QRCode.toCanvas(canvas, currentUrl, { width: 320, margin: 2, errorCorrectionLevel: 'H' }, (err) => {
      if (err) console.error('No se pudo generar el QR:', err);
      else dibujarEtiquetaCentral(canvas, spaceLabel);
    });

    shareBtn.onclick = async () => {
      // El navegador ofrece su propio menú (WhatsApp, mail, etc.) si está
      // disponible — típico en celular. En PC, donde no existe, copiamos el
      // link al portapapeles en vez de fallar mudo.
      if (navigator.share) {
        try {
          await navigator.share({ title: `Cantos de la misa — ${spaceLabel}`, url: currentUrl });
        } catch {
          // El usuario canceló el menú de compartir, o falló: no hace falta avisar nada.
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(currentUrl);
        shareStatusEl.hidden = false;
        shareStatusEl.textContent = '✓ Link copiado';
      } catch {
        shareStatusEl.hidden = false;
        shareStatusEl.textContent = 'No se pudo copiar. Copialo a mano de arriba.';
      }
    };
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSpace = btn.dataset.spaceTab;
      render();
    });
  });

  render();
}

// Pinta un círculo blanco en el centro del QR ya generado, con el nombre
// de la parroquia adentro (partido en hasta 2 líneas, y con la letra
// achicándose sola hasta que entre) — sirve para diferenciar de un
// vistazo el QR impreso de cada parroquia/capilla, sin tener que abrirlos
// para saber cuál es cuál. El radio se queda bien adentro del margen que
// permite la corrección de errores "H" (ver el llamado a QRCode.toCanvas),
// así el QR sigue escaneando bien.
function dibujarEtiquetaCentral(canvas, texto) {
  if (!texto.trim()) return;
  const ctx = canvas.getContext('2d');
  const tamano = canvas.width;
  const cx = tamano / 2;
  const cy = tamano / 2;
  const radio = tamano * 0.15;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2f8a7a';
  ctx.stroke();

  const palabras = texto.trim().split(/\s+/);
  const lineas = palabras.length > 1 ? [palabras.slice(0, Math.ceil(palabras.length / 2)).join(' '), palabras.slice(Math.ceil(palabras.length / 2)).join(' ')] : [texto.trim()];
  const anchoMax = radio * 1.7;

  let fontSize = radio * 0.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  while (fontSize > 8) {
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    const masAncha = Math.max(...lineas.map((linea) => ctx.measureText(linea).width));
    if (masAncha <= anchoMax) break;
    fontSize -= 1;
  }

  ctx.fillStyle = '#163330';
  const alturaLinea = fontSize * 1.15;
  const yInicio = cy - ((lineas.length - 1) * alturaLinea) / 2;
  lineas.forEach((linea, i) => ctx.fillText(linea, cx, yInicio + i * alturaLinea));
  ctx.restore();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
