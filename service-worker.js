/* FlowSheet Service Worker - offline cache */
const CACHE_NAME = "flowsheet-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
        )
      )
  );
  self.clients.claim();
});

// Network-first for .dfsf and dynamic; cache-first for core assets
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // Prefer cache-first for core assets
  const isCore = CORE_ASSETS.some(
    (p) => url.pathname === p || url.pathname.endsWith(p.replace("./", "/"))
  );
  if (isCore) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, resClone));
            return res;
          })
      )
    );
    return;
  }

  // Network-first for others, fallback to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
