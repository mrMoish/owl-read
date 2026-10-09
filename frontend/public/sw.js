// Service Worker: кэширует оболочку приложения (HTML/JS/CSS/иконки).
// Запросы к /api/* НЕ перехватываются: материал дня всегда запрашивается у backend,
// а офлайн-копию хранит само приложение (localStorage).
const VERSION = "v4";
const SHELL = `shell-${VERSION}`;
const PRECACHE = ["/", "/index.html", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Тело ответа в Cache API хранится уже распакованным, но заголовок Content-Encoding
// от сети сохраняется. Отданный как есть, такой ответ распаковывается второй раз
// и модульный скрипт молча не исполняется — поэтому заголовок нужно снимать.
function serveCached(res) {
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Первый визит проходит до активации SW, поэтому хэшированные бандлы Vite не попадают
// в runtime-кэш и офлайн ломается до второго визита. Догреваем их на activate по ссылкам
// из закэшированного index.html.
async function warmBundles() {
  const cache = await caches.open(SHELL);
  const html = await cache.match("/index.html");
  if (!html) return;
  const text = await serveCached(html).text();
  const urls = [...new Set(text.match(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?)/g) || [])];
  await Promise.all(urls.map((u) =>
    fetch(u).then((r) => { if (r.ok) cache.put(u, r.clone()); }).catch(() => {})
  ));
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => warmBundles())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {  // сеть первой, чтобы новая версия приложения подхватывалась
    e.respondWith(
      // cache: "no-store" — иначе при недоступной сети ответ может прийти из HTTP-кэша
      // браузера под видом успешной сети и перезаписать свежую офлайн-копию оболочки
      fetch(req, { cache: "no-store" }).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put("/index.html", r.clone())); return r; })
        .catch(async () => {
          const hit = (await caches.match("/index.html")) || (await caches.match("/offline.html"));
          return hit ? serveCached(hit) : Response.error();
        })
    );
    return;
  }
  // Хит и фоновое обновление — строго раздельные цепочки: повторное использование
  // уже отдаваемого тела ответа бросает TypeError и убивает SW вместе с летящими стримами.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        e.waitUntil(
          fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone())); }).catch(() => {})
        );
        return serveCached(hit);
      }
      return fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone())); return r; });
    })
  );
});
