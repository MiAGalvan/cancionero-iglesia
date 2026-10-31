// Detecta un gesto de "pellizco" (dos dedos separándose o acercándose) sobre
// un elemento, igual que el zoom nativo. En vez de tocar zoom de verdad,
// devuelve un factor de escala relativo al momento en que empezó el gesto
// (1 = sin cambio, >1 = separando los dedos, <1 = juntándolos), para que
// quien lo usa decida qué propiedad escalar con eso.
export function attachPinchZoom(element, { onPinchStart, onPinchMove, onPinchEnd } = {}) {
  const pointers = new Map();
  let startDistance = 0;

  function distance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      startDistance = distance();
      onPinchStart?.();
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && startDistance > 0) {
      onPinchMove?.(distance() / startDistance);
    }
  }

  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2 && startDistance > 0) {
      startDistance = 0;
      onPinchEnd?.();
    }
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endPointer);
  element.addEventListener('pointercancel', endPointer);
}
