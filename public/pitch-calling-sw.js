// TC Diamonds (pitch calling) offline worker. Scope: /pitch-calling.
// The page: network first, falls back to the saved copy with no signal.
// Site files (/_next/static, icons, manifest): saved on first use, served
// from the phone after that. Firebase and other outside calls pass through.
const CACHE = "tc-diamonds-v11";
const PAGE = "/pitch-calling";
const CORE = [PAGE, "/pitch-calling.webmanifest", "/icons/tc-192.png", "/icons/tc-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tc-diamonds-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page sends the files it loaded before this worker was in charge.
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "cache" || !Array.isArray(d.urls)) return;
  const same = d.urls.filter((u) => {
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(same.map((u) => c.add(u).catch(() => {})))));
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/pitch-calling.webmanifest";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && url.pathname.startsWith(PAGE)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(PAGE, res.clone()));
          return res;
        })
        .catch(() => caches.match(PAGE).then((r) => r || Response.error()))
    );
    return;
  }

  if (isStatic(url)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
