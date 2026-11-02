const CACHE_NAME = 'p2p-escrow-v3'; // <--- Incrementamos a v3
const assetsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// 1. Instalación: Guarda los archivos iniciales y fuerza activación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
  self.skipWaiting();
});

// 2. Activación: Limpia las cachés de versiones anteriores y toma el control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Eliminando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Intercepción: Estrategia "Network First" (Red primero, caché si no hay internet)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si la red responde con éxito, devolvemos la versión fresca
        return networkResponse;
      })
      .catch(() => {
        // Si falla la red (dispositivo offline), recurrimos a la caché
        return caches.match(event.request);
      })
  );
});