// Çevrimdışı çalışma: sayfa dosyaları önbellekten, nöbet listeleri önce internetten gelir.
// Sayfa dosyalarını değiştirdiğinde VERSION değerini artır, uygulamalar yeni sürümü alsın.
var VERSION = 'v3';
var SHELL = 'shell-' + VERSION;
var DATA = 'data';
var FILES = [
  './',
  'index.html',
  'assets/style.css',
  'assets/app.js',
  'data/iller.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== DATA; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // fontlar, harita linkleri vb. tarayıcıya kalsın

  // Nöbet listeleri: önce internet, olmazsa son kaydedilen liste
  if (url.pathname.indexOf('/data/il/') !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(DATA).then(function (c) { c.put(url.pathname, copy); });
        }
        return res;
      }).catch(function () {
        return caches.open(DATA).then(function (c) { return c.match(url.pathname); }).then(function (hit) {
          return hit || new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
        });
      })
    );
    return;
  }

  // Sayfa dosyaları: önce önbellek
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).catch(function () {
        return req.mode === 'navigate' ? caches.match('index.html') : undefined;
      });
    })
  );
});
