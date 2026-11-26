// KAAFILA service worker: keeps the app shell and the Roadside page (offline breakdown
// guides, emergency numbers) available without signal. Only same-origin GETs are cached;
// API calls, map tiles and other cross-origin requests always go to the network.
const CACHE_NAME = "kaafila-shell-v2";
const APP_SHELL = ["/", "/offline", "/drive", "/roadside", "/manifest.webmanifest", "/brand/kaafila-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (request.mode === "navigate" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/"))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return (await caches.match("/offline")) ?? Response.error();
        return Response.error();
      })
  );
});
