// Service Worker: hace que la app funcione sin conexión después de la
// primera carga. No usamos Workbox a propósito, para que este archivo se
// pueda leer de punta a punta y entender qué se está cacheando.
//
// Subí este número cada vez que quieras forzar que los usuarios (el equipo,
// en la tablet) bajen la versión nueva de la app en vez de servir la vieja
// desde la caché.
const CACHE_NAME = 'cancionero-iglesia-v3';

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

  // Tampoco los pedidos a OTROS sitios: las consultas de lecturas y
  // antífonas (página pública, ver "Ver lecturas" en el Cronograma) son datos
  // del día. Antes caían en la regla de "caché primero" de más abajo: la
  // primera respuesta quedaba guardada para siempre y la app nunca volvía a
  // preguntarle al servidor — por eso un celular siguió mostrando el salmo
  // sin la respuesta aunque ya estaba corregido (y una consulta de "todavía
  // no disponible" habría quedado así permanentemente).
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navegación (abrir la app, recargar, cambiar de #ruta) O un pedido
  // puntual a index.html: red primero, y si no hay conexión, servimos el
  // index.html cacheado. Como el router es por hash, index.html sirve para
  // cualquier pantalla de la app.
  //
  // OJO: el segundo caso (por url, no por mode) es a propósito — main.js
  // pide "/index.html" a mano (fetch normal, no una navegación real) para
  // comparar y avisar cuando hay una versión nueva (ver checkForUpdate en
  // main.js). Si ese pedido cayera en la rama de abajo ("todo lo demás",
  // caché primero), SIEMPRE recibiría la copia vieja que este mismo Service
  // Worker tiene guardada — la comparación nunca notaría el cambio, y el
  // cartel de "Actualizar" no aparecería nunca (justo lo que pasaba).
  if (request.mode === 'navigate' || request.url.endsWith('/index.html')) {
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
