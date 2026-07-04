const CACHE_NAME = 'finalrep-pwa-v3'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icons/finalrep-192.png',
  '/icons/finalrep-512.png',
  '/icons/finalrep-maskable-512.png',
  '/icons/finalrep.svg',
  '/icons/finalrep-maskable.svg',
]

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
}

function isStaticAsset(url) {
  return ['/assets/', '/icons/'].some((path) => url.pathname.startsWith(path)) || url.pathname === '/favicon.svg'
}

function mustRevalidate(url) {
  return url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/sw.js'
    || url.pathname.endsWith('.webmanifest')
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  return cached || networkPromise
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    return cache.match('/index.html')
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isApiRequest(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (mustRevalidate(url)) {
    event.respondWith(networkFirst(request))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(url.pathname.startsWith('/assets/') ? cacheFirst(request) : staleWhileRevalidate(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
