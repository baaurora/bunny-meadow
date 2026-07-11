/* Bunny Meadow service worker.
   Precache the app shell so it opens instantly and works offline once installed.
   Bump CACHE when files change so the new version replaces the old on next launch. */
const CACHE = "bunny-meadow-v6";
// breed -> pose count
const BREEDS = { marshmallow: 3, domino: 3, biscuit: 3, pip: 3, acorn: 3, marmalade: 3, frost: 2, leo: 3, cloud: 3, sunny: 2, patch: 3, sylvia: 3 };
const IMGS = ["./bunnies/sleeping.png"];
for (const b in BREEDS) for (let i = 0; i < BREEDS[b]; i++) IMGS.push(`./bunnies/${b}-${i}.png`);
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./bunnies.js",
  "./data.js",
  "./meals.js",
  "./config.js",
  "./manifest.webmanifest",
].concat(IMGS);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never cache sync POSTs
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (sync API) pass through
  // Network-first for the app files so updates land, falling back to cache offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
