// 轻食记 Service Worker：页面导航网络优先（保证更新及时），静态资源缓存优先；API 与智谱请求不走缓存
const CACHE = "fitlog-static-v2";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/api/") || url.origin !== location.origin) return;
  // 页面导航：网络优先，离线才用缓存（保证发新版后用户打开即最新）
  if (e.request.mode === "navigate" || url.pathname.endsWith("index.html")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, cp));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }
  // 静态资源（带 hash 的 js/css/图标）：缓存优先
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, cp));
          }
          return res;
        })
    )
  );
});
