// Only public Open Library cover images are cached. Never authenticated content.
const COVER_CACHE = "entrelinhas-public-covers-v1";
const COVER_LIMIT = 10;
const COVER_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const pendingCovers = new Map();
let selectedCovers = new Set();
let coverGeneration = 0;
function publicCover(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://covers.openlibrary.org" &&
      /^\/b\/id\/[1-9]\d*-L\.jpg$/.test(parsed.pathname) &&
      parsed.search === "?default=false";
  } catch { return false; }
}
async function loadCover(url) {
  if (pendingCovers.has(url)) return (await pendingCovers.get(url)).clone();
  const task = (async () => {
    const cache = await caches.open(COVER_CACHE);
    const cached = await cache.match(url);
    // CORS responses let us reject missing covers instead of persisting opaque errors.
    if (cached && Date.now() - Number(cached.headers.get("x-entrelinhas-cached-at")) < COVER_MAX_AGE) return cached;
    const response = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    if (response.ok && /^image\//i.test(response.headers.get("content-type") || "") && selectedCovers.has(url)) {
      const headers = new Headers(response.headers);
      headers.set("x-entrelinhas-cached-at", String(Date.now()));
      const stored = new Response(await response.clone().blob(), { status: response.status, headers });
      if (selectedCovers.has(url)) await cache.put(url, stored);
      // A selection change during fetch must not leave stale entries behind.
      if (!selectedCovers.has(url)) await cache.delete(url);
    }
    return response;
  })();
  pendingCovers.set(url, task);
  try { return (await task).clone(); } finally { pendingCovers.delete(url); }
}
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_LIBRARY_COVERS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.filter(url => typeof url === "string" && publicCover(url)))].slice(0, COVER_LIMIT);
  selectedCovers = new Set(urls);
  const generation = ++coverGeneration;
  event.waitUntil((async () => {
    const cache = await caches.open(COVER_CACHE);
    for (const request of await cache.keys()) if (!selectedCovers.has(request.url)) await cache.delete(request);
    // Two concurrent requests avoid competing with the rest of the initial page.
    let cursor = 0;
    await Promise.all([0, 1].map(async () => {
      while (cursor < urls.length && generation === coverGeneration) {
        const url = urls[cursor++];
        try { await loadCover(url); } catch {} // Normal image loading remains available.
      }
    }));
  })().catch(() => {}));
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method === "GET" && publicCover(e.request.url)) {
    e.respondWith(loadCover(e.request.url).catch(() => fetch(e.request)));
    return;
  }
  if (e.request.mode === "navigate")
    e.respondWith(
      fetch(e.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Sem conexão · Entrelinhas</title><body style="font:18px system-ui;background:#f6f4ed;color:#244f43;padding:40px"><h1>Você está sem conexão.</h1><p>Reconecte para abrir sua biblioteca e salvar anotações.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
});
