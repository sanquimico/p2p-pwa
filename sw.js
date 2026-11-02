const CACHE_NAME = 'p2p-escrow-v4';
const assetsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// 1. Instalación: Guarda los archivos en silencio (sin forzar activación inmediata)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

// 2. Activación: Limpia cachés obsoletas de versiones anteriores
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

// 3. Estrategia Network First (Red primero, respaldo en caché si no hay internet)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// 4. Escucha la orden de actualizar enviada desde el botón de la interfaz
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});