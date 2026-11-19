// Service worker: l'interfaccia funziona anche offline; i dati delle zone già viste restano in memoria.
// BUILD viene sostituito dal workflow di pubblicazione con l'identificativo del commit.
const BUILD = "dev";
const CACHE = "dove-raga-" + BUILD;
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
  "js/app.js", "js/geo.js", "js/data.js", "js/pick.js", "js/link.js", "js/comuni.js", "js/card.js",
  "fonts/dela-gothic-one.woff2", "fonts/zen-kaku-gothic-new-400.woff2", "fonts/zen-kaku-gothic-new-700.woff2",
];
const NET_TIMEOUT = 3500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("dove-raga-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rete prima (con tempo massimo), poi copia in memoria. I font non cambiano: memoria prima.
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/fonts/")) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(networkFirst(req, e));
});

async function networkFirst(req, e) {
  const fallback = async () => (await caches.match(req, { ignoreSearch: true }))
    || (req.mode === "navigate" ? caches.match("index.html") : undefined);
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
    return r;
  });
  // Se la rete è lenta, si usa la copia in memoria (se c'è); altrimenti si aspetta la rete.
  const slow = new Promise(res => setTimeout(res, NET_TIMEOUT)).then(async () => (await fallback()) || net);
  try {
    return await Promise.race([net, slow]);
  } catch {
    return (await fallback()) || Response.error();
  }
}
