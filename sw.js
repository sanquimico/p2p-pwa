const CACHE_NAME = 'p2p-escrow-v2'; // <--- Incrementa esta versión en cada actualización importante
const assetsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// 1. Instalación: Guarda los nuevos archivos y fuerza la activación inmediata
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
  self.skipWaiting(); // Fuerza al Service Worker nuevo a activarse sin esperar
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
  self.clients.claim(); // Toma el control de todas las pestañas abiertas de inmediato
});

// 3. Intercepción: Sirve desde la caché, pero busca actualización en red
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Retorna la versión en caché si existe, sino hace fetch a la red
      return cachedResponse || fetch(event.request);
    })
  );
});