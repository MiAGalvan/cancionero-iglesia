import { wrapSelectionInBold } from './textareaBold.js';

// Overlay de edición a pantalla completa para un textarea puntual — pensado
// para celular, donde escribir en una caja chica dentro de una pantalla
// larga obliga a scrollear la caja Y la página al mismo tiempo. Se usa
// desde varios lugares (letra sin acordes, ChordPro, texto pegado de la
// web), por eso vive en un solo lugar en vez de repetirse en cada uno.
export function openFullscreenTextEditor({ title, initialValue, placeholder = '', onSave }) {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-editor';
  overlay.innerHTML = `
    <div class="fullscreen-editor-topbar">
      <button type="button" class="btn" id="fse-cancel">Cancelar</button>
      <h3>${escapeHtml(title)}</h3>
      <div class="fullscreen-editor-topbar-right">
        <button type="button" class="btn btn-icon" id="fse-bold" title="Resaltar en negrita lo seleccionado (ej. el estribillo)"><strong>B</strong></button>
        <button type="button" class="btn btn-accent" id="fse-done">✓ Listo</button>
      </div>
    </div>
    <textarea class="fullscreen-editor-textarea" id="fse-textarea" placeholder="${escapeAttr(placeholder)}"></textarea>
  `;
  document.body.appendChild(overlay);

  const textarea = overlay.querySelector('#fse-textarea');
  textarea.value = initialValue || '';
  textarea.focus();
  // Arranca con el cursor al final (donde probablemente se sigue
  // escribiendo), no al principio como pondría el foco por defecto.
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  overlay.querySelector('#fse-bold').addEventListener('click', () => wrapSelectionInBold(textarea));

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeydown);

  overlay.querySelector('#fse-cancel').addEventListener('click', close);
  overlay.querySelector('#fse-done').addEventListener('click', () => {
    onSave(textarea.value);
    close();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
