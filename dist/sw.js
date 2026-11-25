const cacheName = 'petti-kada-shell-v2';
const shell = ['index.html', 'style.css?v=2', 'app.js?v=2', 'db.js?v=2'].map(file => new URL(file, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('petti-kada-shell-') && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.mode === 'navigate' && url.origin === scope.origin &&
      (url.pathname === scope.pathname || url.pathname === new URL(shell[0]).pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(shell[0])));
  } else if (shell.includes(url.href)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(request)) ?? fetch(request))());
  }
});
