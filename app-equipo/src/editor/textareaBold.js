// Envuelve la selección actual de un textarea en **negrita**, para marcar el
// estribillo (o cualquier otra parte) sin tener que tipear los asteriscos a
// mano — pensado para gente que no es muy ducha con la computadora: elegís
// el texto y tocás el botón "B", como en Word o WhatsApp. Vive aparte (no
// adentro de un textarea puntual) porque lo usan tanto el textarea de
// ChordPro/letra de siempre como el editor a pantalla completa.
export function wrapSelectionInBold(textarea) {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === selectionEnd) {
    // Sin nada seleccionado: deja los asteriscos puestos con el cursor en
    // el medio, listo para escribir ahí mismo.
    textarea.value = value.slice(0, selectionStart) + '****' + value.slice(selectionEnd);
    textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
  } else {
    const seleccionado = value.slice(selectionStart, selectionEnd);
    textarea.value = value.slice(0, selectionStart) + `**${seleccionado}**` + value.slice(selectionEnd);
    textarea.selectionStart = selectionStart + 2;
    textarea.selectionEnd = selectionStart + 2 + seleccionado.length;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}
