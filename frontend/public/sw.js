// Service Worker: кэширует только оболочку приложения (HTML/JS/CSS/иконки).
// Запросы к /api/* НЕ перехватываются: материал дня всегда запрашивается у backend,
// а офлайн-копию хранит само приложение (localStorage).
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PRECACHE = ["/", "/index.html", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {  // сеть первой, чтобы новая версия приложения подхватывалась
    e.respondWith(
      fetch(req).then((r) => { caches.open(SHELL).then((c) => c.put("/index.html", r.clone())); return r; })
        .catch(async () => (await caches.match("/index.html")) || caches.match("/offline.html"))
    );
    return;
  }
  e.respondWith(  // статика: из кэша, обновляя в фоне
    caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    })
  );
});
