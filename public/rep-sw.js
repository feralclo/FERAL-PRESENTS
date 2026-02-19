/// Rep Portal Service Worker
/// Handles push notifications and basic offline caching

const CACHE_NAME = "rep-v1";
const OFFLINE_URL = "/rep";

// Assets to pre-cache for offline
const PRECACHE_URLS = [OFFLINE_URL];

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
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch (network-first, fallback to cache) ───────────────────────────────

self.addEventListener("fetch", (event) => {
  // Only handle navigation requests for offline fallback
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || new Response("Offline", { status: 503 }))
    )
  );
});

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
    icon: "/images/rep-icon-192.png",
    badge: "/images/rep-icon-192.png",
    tag: payload.tag || "rep-notification",
    data: {
      url: payload.url || "/rep",
    },
    vibrate: [100, 50, 100],
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
