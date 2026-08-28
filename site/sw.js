const CACHE = 'bracomil-share-v14';
const SHARE_INBOX_CACHE = 'bracomil-inbox-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(k =>
          k.startsWith('bracomil-share-') &&
          k !== CACHE
        )
        .map(k => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'POST' &&
    url.pathname.endsWith('/share-target')
  ) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const files = formData
        .getAll('files')
        .filter(v => v instanceof File);

      const file = files[0];

      if (file) {
        const headers = new Headers({
          'Content-Type':
            file.type || 'application/octet-stream',
          'X-Shared-File-Name':
            encodeURIComponent(file.name || 'arquivo')
        });

        const cache = await caches.open(SHARE_INBOX_CACHE);

        await cache.put(
          './__shared_file__',
          new Response(file, { headers })
        );
      }

      return Response.redirect(
        new URL(
          './index.html?shared=1',
          event.request.url
        ).href,
        303
      );
    })());

    return;
  }

  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then(r => r || fetch(event.request))
    );
  }
});
