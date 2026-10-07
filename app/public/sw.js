/* Minimal service worker so Chrome can offer "Install app".
   Network-first for navigations; cache-first for same-origin icons. */
const CACHE = 'rrcentral-shell-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']),
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./') || caches.match(request)),
    )
    return
  }

  if (url.pathname.includes('/icons/') || url.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone()
        void caches.open(CACHE).then((c) => c.put(request, copy))
        return res
      })),
    )
  }
})
