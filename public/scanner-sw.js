/// Scanner PWA Service Worker
/// Handles offline caching for the scanner app

const CACHE_NAME = "scanner-v1";
const API_CACHE_NAME = "scanner-api-v1";
const OFFLINE_URL = "/scanner";

const PRECACHE_URLS = [OFFLINE_URL];

const SWR_API_PATTERNS = [
  "/api/scanner/events",
  "/api/branding",
];

const API_CACHE_MAX_AGE = 2 * 60 * 1000; // 2 minutes

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache scan/merch POST mutations
  if (event.request.method !== "GET") return;

  // Stale-while-revalidate for cacheable API routes
  if (SWR_API_PATTERNS.some((pattern) => url.pathname.startsWith(pattern))) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Navigation requests — network-first with offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((cached) => cached || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }
});

// ─── Stale-While-Revalidate Strategy ─────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone();
        const headers = new Headers(clone.headers);
        headers.set("sw-cached-at", Date.now().toString());
        clone.blob().then((body) => {
          cache.put(
            request,
            new Response(body, {
              status: clone.status,
              statusText: clone.statusText,
              headers,
            })
          );
        });
      }
      return response;
    })
    .catch(() => cached || new Response('{"error":"Offline"}', {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));

  if (cached) {
    return cached;
  }

  return networkFetch;
}
