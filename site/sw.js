const CACHE = 'bracomil-share-v19';
const SHARE_INBOX_CACHE = 'bracomil-inbox-v2';

const APP_SHELL = [
  './index.html',
  './styles.css?v=19',
  './app.js?v=19',
  './manifest.webmanifest?v=19',
  './icon-192.png',
  './icon-512.png'
];

function inboxKey() {
  return new URL('./__shared_file__', self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('bracomil-share-') &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    // Não apaga o inbox; ele é separado do cache do app.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const isShareTarget =
    event.request.method === 'POST' &&
    (
      url.pathname.endsWith('/share-target') ||
      url.pathname.endsWith('/share-target/')
    );

  if (isShareTarget) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  // Navegações: rede primeiro para reduzir risco de HTML antigo preso em cache.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (err) {
        return (
          await caches.match('./index.html') ||
          Response.error()
        );
      }
    })());
    return;
  }

  // Assets: cache primeiro, com atualização em background quando possível.
  event.respondWith((async () => {
    const cached = await caches.match(event.request);

    const networkPromise = fetch(event.request)
      .then(async response => {
        if (response && response.ok && response.type !== 'opaque') {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    return (await networkPromise) || Response.error();
  })());
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const values = formData.getAll('files');
    const file = values.find(value =>
      value instanceof File && value.size > 0
    );

    if (!file) {
      return redirectToApp('share_error=no_file');
    }

    const headers = new Headers({
      'Content-Type': file.type || 'application/octet-stream',
      'X-Shared-File-Name': encodeURIComponent(file.name || 'arquivo'),
      'X-Shared-File-Size': String(file.size || 0),
      'X-Shared-At': new Date().toISOString()
    });

    const cache = await caches.open(SHARE_INBOX_CACHE);
    const key = inboxKey();

    await cache.put(
      key,
      new Response(file, { headers })
    );

    // Verificação imediata: só redireciona como sucesso se o objeto puder ser relido.
    const persisted = await cache.match(key);

    if (!persisted) {
      throw new Error('Arquivo não pôde ser relido após cache.put().');
    }

    return redirectToApp('shared=1');
  } catch (err) {
    console.error('[BRACOMIL SHARE] Falha no share target:', err);
    return redirectToApp(
      'share_error=' + encodeURIComponent(err?.name || 'cache_error')
    );
  }
}

function redirectToApp(query) {
  const target = new URL('./index.html', self.registration.scope);
  target.search = query;
  return Response.redirect(target.href, 303);
}
