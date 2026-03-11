/// Rep Portal Service Worker
/// Handles push notifications, offline caching, and API response caching

const CACHE_NAME = "rep-v3";
const API_CACHE_NAME = "rep-api-v3";
const OFFLINE_URL = "/rep";

// Assets to pre-cache for offline
const PRECACHE_URLS = [OFFLINE_URL];

// API routes to cache with stale-while-revalidate
// These change infrequently and are safe to serve stale while refreshing
const SWR_API_PATTERNS = [
  "/api/branding",
  "/api/rep-portal/settings",
  "/api/rep-portal/discount",
  "/api/rep-portal/auth-check",
  "/api/rep-portal/dashboard",
  "/api/rep-portal/quests",
  "/api/rep-portal/rewards",
  "/api/rep-portal/leaderboard",
  "/api/rep-portal/sales",
  "/api/rep-portal/me",
];

// Max age for cached API responses (5 minutes)
const API_CACHE_MAX_AGE = 5 * 60 * 1000;

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

  // On POST/PUT/DELETE to rep-portal APIs, bust the cache so subsequent
  // GETs return fresh data (fixes stale balance after reward claims, etc.)
  if (
    event.request.method !== "GET" &&
    url.pathname.startsWith("/api/rep-portal/")
  ) {
    event.waitUntil(
      caches.open(API_CACHE_NAME).then((cache) =>
        cache.keys().then((keys) =>
          Promise.all(
            keys
              .filter((k) => new URL(k.url).pathname.startsWith("/api/rep-portal/"))
              .map((k) => cache.delete(k))
          )
        )
      )
    );
    // Fall through — don't intercept the mutation itself
  }

  // Stale-while-revalidate for cacheable API routes (GET only)
  if (
    event.request.method === "GET" &&
    SWR_API_PATTERNS.some((pattern) => url.pathname.startsWith(pattern))
  ) {
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

  // Start network fetch in background
  const networkFetch = fetch(request)
    .then((response) => {
      // Only cache successful responses
      if (response.ok) {
        // Clone before caching (response body can only be read once)
        const clone = response.clone();
        // Store with timestamp header for freshness checks
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

  // If we have a cached response, serve it immediately
  if (cached) {
    // Check if cache is stale (older than max age)
    const cachedAt = parseInt(cached.headers.get("sw-cached-at") || "0", 10);
    const isStale = Date.now() - cachedAt > API_CACHE_MAX_AGE;

    if (!isStale) {
      // Fresh cache — still revalidate in background but serve cached
      return cached;
    }

    // Stale cache — serve it but the network fetch will update it
    return cached;
  }

  // No cache — wait for network
  return networkFetch;
}

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Entry Reps", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    tag: payload.tag || "rep-notification",
    data: {
      url: payload.url || "/rep",
    },
    vibrate: [80, 40, 80, 60, 120],
    actions: payload.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Entry Reps", options)
  );
});

// ─── Notification Click ──────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/rep";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if one exists on the rep portal
        const existing = clients.find((c) => c.url.includes("/rep"));
        if (existing) {
          existing.navigate(url);
          return existing.focus();
        }
        // Otherwise open a new tab
        return self.clients.openWindow(url);
      })
  );
});
