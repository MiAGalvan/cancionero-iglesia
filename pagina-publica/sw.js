// Service worker mínimo: existe solo para que el navegador considere esta
// página "instalable" (uno de los requisitos técnicos, junto con el
// manifest, para que aparezca el botón de instalar). No cachea nada a
// propósito — esta página siempre tiene que mostrar la lista y las
// novedades más recientes, nunca una versión vieja guardada.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
