const CACHE_NAME = '10kvendor-cache-v1';
const DYNAMIC_CACHE_NAME = '10kvendor-dynamic-v1';

// Core app shell files (must be cached)
const urlsToCache = [
  '/',
  '/index.html',
  'static/logo.png',
];

// Optional resources (cached opportunistically)
const optionalUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js',
  'https://cdn.jsdelivr.net/npm/animejs/lib/anime.iife.min.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
];

// Install: cache core + optional assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('Caching core assets...');
      try {
        await cache.addAll(urlsToCache);
      } catch (error) {
        console.error('Failed to cache core assets:', error);
        throw error; // Fail install if core fails
      }

      // Opportunistic caching of optional assets
      optionalUrlsToCache.forEach(url => {
        fetch(url)
          .then(response => {
            if (response.ok) {
              cache.put(url, response.clone());
            } else {
              console.warn(`Optional resource failed: ${url}`);
            }
          })
          .catch(err => console.warn(`Failed to cache optional: ${url}`, err));
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Handle API requests separately
  if (requestUrl.pathname.startsWith('/api/public/')) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache =>
        fetch(event.request)
          .then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() =>
            caches.match(event.request).then(cachedResponse => {
              if (cachedResponse) return cachedResponse;
              return new Response(
                JSON.stringify({ error: 'Offline: Unable to fetch data' }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            })
          )
      )
    );
  } else {
    // Static + navigation requests
    event.respondWith(
      caches.match(event.request).then(response =>
        response ||
        fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        })
      )
    );
  }
});

// Push: handle incoming push notifications
self.addEventListener('push', event => {
  let data = {
    title: '10kVendor',
    body: 'New update available!',
    url: '/orders.html'
  };
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: 'static/logo.png',
    badge: 'static/logo.png',
    data: { url: data.url || '/orders.html' },
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view-order',
        title: 'View Order'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click: open the app or specific URL
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data.url || '/orders.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (let client of clientsArr) {
        if (client.url.includes('orders.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});