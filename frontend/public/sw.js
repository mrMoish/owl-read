// Service Worker: кэширует оболочку приложения (HTML/JS/CSS/иконки) и все статические
// ресурсы, загруженные при первом визите.
// Запросы к /api/* НЕ перехватываются: материал дня всегда запрашивается у backend,
// а офлайн-копию хранит само приложение (localStorage).
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;

// Ресурсы, которые нужно закэшировать сразу при установке SW
const PRECACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Пропускаем не-GET, чужие origin и запросы к API
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Навигация: сеть первой, кэш как запасной вариант
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) caches.open(SHELL).then((c) => c.put("/index.html", r.clone()));
          return r;
        })
        .catch(async () => (await caches.match("/index.html")) || caches.match("/offline.html"))
    );
    return;
  }

  // Все статические ресурсы (JS, CSS, шрифты, иконки):
  // если есть в кэше — отдаём сразу и обновляем в фоне (stale-while-revalidate),
  // если нет — загружаем из сети и кладём в кэш для следующего раза.
  e.respondWith(
    caches.match(req).then((hit) => {
      const networkFetch = fetch(req).then((r) => {
        if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone()));
        return r;
      }).catch(() => hit);

      if (hit) {
        networkFetch.catch(() => {});
        return hit;
      }
      return networkFetch;
    })
  );
});
