const CACHE = 'bracomil-share-v18';
const SHARE_INBOX_CACHE = 'bracomil-inbox-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    console.log("Pegando keys do cache")
    const keys = await caches.keys();
    console.log("Keys", keys)
    await Promise.all(
      keys
        .filter(k =>
          k.startsWith('bracomil-share-') &&
          k !== CACHE
        )
        .map(k => caches.delete(k))
    );
    console.log("Delete keys", keys)
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  console.log("Starting fetch")

  const isShareTarget =
    url.pathname.endsWith('/share-target') ||
    url.pathname.endsWith('/share-target/');

  if (
    event.request.method === 'POST' &&
    isShareTarget
  ) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const files = formData
        .getAll('files')
        .filter(v => v instanceof File);

      const file = files[0];
      console.log("file in POST", file ? file.name || "arquivo" : "no file")
      if (file) {
        const headers = new Headers({
          'Content-Type':
            file.type || 'application/octet-stream',
          'X-Shared-File-Name':
            encodeURIComponent(file.name || 'arquivo')
        });
        console.log("Opening cache")
        try {
          const cache = await caches.open(SHARE_INBOX_CACHE);

          console.log(
            '[SHARE] cache aberto:',
            SHARE_INBOX_CACHE
          );

          console.log(
            '[SHARE] arquivo:',
            file?.name,
            file?.size,
            file?.type
          );

          await cache.put(
            './__shared_file__',
            new Response(file, { headers })
          );

          console.log(
            '[SHARE] cache.put OK'
          );

          const test = await cache.match('./__shared_file__');

          console.log(
            '[SHARE] leitura imediata após put:',
            !!test
          );

        } catch (err) {
          console.error(
            '[SHARE] ERRO cache.put:',
            err?.name,
            err?.message,
            err
          );

          throw err;
        }
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
