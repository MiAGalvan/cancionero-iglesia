// Instalar como app: el navegador tiene una opción para esto escondida en
// su propio menú (algo como "Agregar a pantalla de inicio" o "Instalar
// app"), pero a mucha gente le cuesta encontrarla. Acá se escucha el
// evento que dispara Chrome cuando la página cumple los requisitos para
// instalarse (manifest + service worker, ya los tiene esta app) y se
// guarda para poder disparar el cartel nativo nosotros mismos con un
// botón bien visible, en vez de depender de que alguien encuentre esa
// opción sola.
//
// Este módulo se importa una sola vez desde main.js (efecto secundario,
// para no perderse el evento si llega antes de que se pinte la pantalla
// de Inicio) y las pantallas que quieran mostrar el botón consultan acá
// el estado en vez de escuchar el evento cada una por su cuenta.
let deferredPrompt = null;
let listeners = [];

function avisarCambio() {
  listeners.forEach((fn) => fn());
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  avisarCambio();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  avisarCambio();
});

export function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

export function puedeInstalar() {
  return Boolean(deferredPrompt) && !estaInstalada();
}

// En iPhone (Safari) nunca llega beforeinstallprompt — no hay forma de
// disparar el cartel desde código, solo se puede explicar los pasos.
export function mostrarInstruccionesIOS() {
  return esIOS && !estaInstalada() && !deferredPrompt;
}

export async function instalar() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const eleccion = await deferredPrompt.userChoice;
  deferredPrompt = null;
  avisarCambio();
  return eleccion.outcome === 'accepted';
}

// Devuelve una función para dejar de escuchar (no se usa por ahora — las
// pantallas de esta app no tienen un "desmontado" explícito — pero queda
// disponible por si hace falta más adelante).
export function onCambioDisponibilidad(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}
