/* Minimal service worker so Chrome can offer "Install app".
   Network-first for navigations, manifest, and icons so branding updates stick. */
const CACHE = 'rrcentral-shell-v7'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/RRCentral/',
        '/RRCentral/app/',
        '/RRCentral/manifest.webmanifest',
        '/RRCentral/apple-touch-icon.png',
        '/RRCentral/apple-touch-icon-precomposed.png',
        '/RRCentral/apple-touch-icon-180x180.png',
        '/RRCentral/app/apple-touch-icon.png',
        '/RRCentral/login/apple-touch-icon.png',
        '/RRCentral/icons/icon-192.png',
        '/RRCentral/icons/icon-512.png',
        '/RRCentral/icons/apple-touch-icon.png',
      ]),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith('/RRCentral/')) return

  const isNav = request.mode === 'navigate'
  const path = url.pathname
  const isBrandAsset =
    path.endsWith('manifest.webmanifest') ||
    path.includes('/icons/') ||
    path.includes('apple-touch-icon') ||
    /favicon-\d+\.png$/.test(path)

  if (isNav || isBrandAsset) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && isBrandAsset) {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match('/RRCentral/app/') || caches.match('/RRCentral/')),
        ),
    )
  }
})
