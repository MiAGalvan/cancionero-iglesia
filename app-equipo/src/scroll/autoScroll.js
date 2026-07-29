// Autoscroll suave del contenedor de la letra, para no tener que tocar la
// tablet mientras se toca/canta. Usamos requestAnimationFrame en vez de
// setInterval porque rAF se sincroniza con el refresco de pantalla (~60fps)
// y da un desplazamiento fluido en vez de saltos a intervalos fijos.
export function createAutoScroller(container, { initialSpeed = 40 } = {}) {
  let pixelsPerSecond = initialSpeed;
  let running = false;
  let lastTimestamp = null;
  let rafId = null;

  // Guardamos la posición nosotros mismos, en vez de ir sumando sobre
  // container.scrollTop directamente. El navegador redondea scrollTop a
  // entero al leerlo: a velocidades bajas (ej. 15px/seg = 0.25px por cuadro)
  // esa fracción se pierde en cada lectura y el scroll nunca avanza. Sumando
  // sobre esta variable propia (que sí guarda decimales) y sólo *escribiendo*
  // el resultado en scrollTop, no perdemos nada.
  let scrollPosition = container.scrollTop;

  function step(timestamp) {
    if (!running) return;

    if (lastTimestamp !== null) {
      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      scrollPosition += pixelsPerSecond * deltaSeconds;
      container.scrollTop = scrollPosition;
    }
    lastTimestamp = timestamp;
    rafId = requestAnimationFrame(step);
  }

  function play() {
    if (running) return;
    running = true;
    lastTimestamp = null; // evita un salto grande usando el timestamp de un frame viejo
    // Por si el usuario scrolleó a mano (o tocó "Inicio") mientras estaba
    // pausado, arrancamos desde donde está la letra ahora, no desde donde
    // se había quedado nuestro acumulador.
    scrollPosition = container.scrollTop;
    rafId = requestAnimationFrame(step);
  }

  function pause() {
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function toggle() {
    if (running) pause();
    else play();
  }

  function setSpeed(newPixelsPerSecond) {
    // El slider solo cambia esta variable; el loop de rAF ya en marcha la lee
    // en el próximo frame, así que no hace falta reiniciar nada.
    pixelsPerSecond = newPixelsPerSecond;
  }

  function reset() {
    container.scrollTop = 0;
    scrollPosition = 0;
  }

  function isRunning() {
    return running;
  }

  return { play, pause, toggle, setSpeed, reset, isRunning };
}
