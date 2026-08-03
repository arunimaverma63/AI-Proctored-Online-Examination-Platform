const CACHE_NAME = "ai-proctored-exam-v1";
const OFFLINE_URL = "/offline";

const INITIAL_CACHED_RESOURCES = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
];

// Installation: pre-cache critical offline resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(INITIAL_CACHED_RESOURCES);
    })
  );
  self.skipWaiting();
});

// Activation: clean up stale cache entries
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: intercept requests and serve from network first, falling back to cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests and skip internal Next.js development hot reloading
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("/_next/webpack-hmr") ||
    event.request.url.includes("/api/")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If request is successful, clone and store it in cache
        if (response && response.status === 200 && response.type === "basic") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fetch failed (offline)
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For page navigation requests, return the offline fallback page
        if (event.request.mode === "navigate") {
          const offlineCache = await caches.open(CACHE_NAME);
          const offlinePage = await offlineCache.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
        }

        // Return a basic offline fallback response for other assets
        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({ "Content-Type": "text/plain" })
        });
      })
  );
});
