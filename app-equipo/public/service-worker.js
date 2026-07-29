// Service Worker: hace que la app funcione sin conexión después de la
// primera carga. No usamos Workbox a propósito, para que este archivo se
// pueda leer de punta a punta y entender qué se está cacheando.
//
// Subí este número cada vez que quieras forzar que los usuarios (el equipo,
// en la tablet) bajen la versión nueva de la app en vez de servir la vieja
// desde la caché.
const CACHE_NAME = 'cancionero-iglesia-v1';

// El "app shell": lo mínimo para que la app abra offline. El resto de los
// archivos (el JS/CSS de Vite, que tienen nombres con hash) se van cacheando
// solos la primera vez que se piden, ver el fetch handler más abajo.
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Llamadas a Supabase (publicar / login) nunca se cachean: siempre tienen
  // que ir a la red, o fallar limpio si no hay conexión. Si se cachearan,
  // "publicar" podría creer que funcionó sirviendo una respuesta vieja.
  if (request.url.includes('supabase.co')) return;

  // Navegación (abrir la app, recargar, cambiar de #ruta): red primero,
  // y si no hay conexión, servimos el index.html cacheado. Como el router
  // es por hash, index.html sirve para cualquier pantalla de la app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Todo lo demás (JS, CSS, íconos): caché primero, y si no está, se busca
  // en la red y se guarda una copia para la próxima vez que se pida offline.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      });
    })
  );
});
