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

  // Mientras el usuario tiene el dedo apoyado sobre la letra, dejamos de
  // escribir nosotros el scroll: si no, cada cuadro (a ~60fps) pisaría el
  // deslizamiento casi al instante y se sentiría trabado. Apenas suelta (y
  // pasa la inercia del scroll nativo, que sigue mandando eventos "scroll"
  // sola un rato más), retomamos el autoscroll justo desde ahí — sin haber
  // tenido que pausarlo.
  let userInteracting = false;
  let resumeTimeoutId = null;
  const RESUME_DELAY_MS = 400;

  function beginUserInteraction() {
    userInteracting = true;
    clearTimeout(resumeTimeoutId);
  }

  function scheduleResume() {
    clearTimeout(resumeTimeoutId);
    resumeTimeoutId = setTimeout(() => {
      userInteracting = false;
      scrollPosition = container.scrollTop;
      lastTimestamp = null; // evita un salto grande al retomar
    }, RESUME_DELAY_MS);
  }

  container.addEventListener('pointerdown', beginUserInteraction);
  container.addEventListener('pointerup', scheduleResume);
  container.addEventListener('pointercancel', scheduleResume);
  container.addEventListener('scroll', () => {
    if (!userInteracting) return;
    // Seguimos la posición real mientras dura el gesto (arrastre + inercia
    // posterior), y pateamos el resumen para más adelante: recién cuando
    // dejan de llegar eventos "scroll" damos por terminado el gesto.
    scrollPosition = container.scrollTop;
    scheduleResume();
  });

  function step(timestamp) {
    if (!running) return;

    if (!userInteracting) {
      if (lastTimestamp !== null) {
        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        scrollPosition += pixelsPerSecond * deltaSeconds;
        container.scrollTop = scrollPosition;
      }
      lastTimestamp = timestamp;
    } else {
      lastTimestamp = null; // no acumular tiempo "muerto" mientras el usuario mueve la letra a mano
    }
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
