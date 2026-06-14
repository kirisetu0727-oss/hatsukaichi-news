const CACHE_NAME = 'hatsukaichi-news-v1';
const STATIC_ASSETS = [
  '/public/index.html',
  '/public/css/style.css',
  '/public/js/app.js',
  '/public/js/main.js',
  '/public/js/news.js',
  '/public/js/article.js',
  '/public/js/saved.js',
  '/public/js/user.js',
  '/public/js/admin.js',
  '/public/js/storage.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // articles.json: ネットワーク優先、失敗時はキャッシュ
  if (url.pathname.endsWith('articles.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 静的アセット: キャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
