import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
test("PWA possui ícones instaláveis e nenhum cache privado", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  for (const n of [192, 512]) {
    assert.ok(manifest.icons.find((i) => i.sizes === `${n}x${n}`));
    assert.equal(
      readFileSync(`public/icon-${n}.png`).subarray(1, 4).toString(),
      "PNG",
    );
  }
});
test("navegação sem rede retorna página de recuperação em português", async () => {
  const events = {};
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { addEventListener: (name, handler) => (events[name] = handler) },
    fetch: () => Promise.reject(Error("offline")),
    Response,
  });
  let response;
  events.fetch({
    request: { mode: "navigate" },
    respondWith: (p) => (response = p),
  });
  const html = await (await response).text();
  assert.match(html, /Você está sem conexão/);
  assert.match(html, /Tentar novamente/);
});
test("service worker não intercepta nem armazena APIs e fotos", () => {
  const events = {};
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { addEventListener: (name, handler) => (events[name] = handler) },
    Response,
  });
  let intercepted = false;
  events.fetch({
    request: { mode: "cors" },
    respondWith: () => (intercepted = true),
  });
  assert.equal(intercepted, false);
});

function coverWorker() {
  const events = {}, entries = new Map(), requests = [];
  let now = 1000000000, failure = false;
  const cache = {
    match: async url => entries.get(url)?.clone(),
    keys: async () => [...entries.keys()].map(url => ({ url })),
    put: async (url, response) => { entries.set(url, response.clone()); },
    delete: async request => entries.delete(typeof request === "string" ? request : request.url),
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { addEventListener: (name, handler) => { events[name] = handler; } },
    caches: { open: async () => cache }, URL, Response, Headers,
    Date: { now: () => now },
    fetch: async url => { requests.push(url); return new Response(failure ? "missing" : "image", { status: failure ? 404 : 200, headers: { "content-type": failure ? "text/plain" : "image/jpeg" } }); },
  });
  return { entries, requests,
    fail: () => { failure = true; }, advance: () => { now += 8 * 86400000; },
    warm: async urls => { let done; events.message({ data: { type: "CACHE_LIBRARY_COVERS", urls }, waitUntil: p => { done = p; } }); await done; },
    load: async url => { let response; events.fetch({ request: { url, method: "GET", mode: "no-cors" }, respondWith: p => { response = p; } }); return response ? await response : null; },
  };
}
const coverUrl = id => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`;
test("Cache limita dez capas públicas, reutiliza imagens e acompanha a seleção", async () => {
  const w = coverWorker();
  await w.warm([...Array.from({ length: 12 }, (_, i) => coverUrl(i + 1)), "/api/photos/private", "https://example.com/photo.jpg"]);
  assert.equal(w.entries.size, 10);
  assert.equal(w.requests.length, 10);
  assert.equal(await (await w.load(coverUrl(1))).text(), "image");
  assert.equal(w.requests.length, 10);
  assert.equal(await w.load("https://entrelinhas-five-iota.vercel.app/api/photos/private"), null);
  await w.warm([coverUrl(12)]);
  assert.deepEqual([...w.entries.keys()], [coverUrl(12)]);
});
test("Cache renova capas expiradas e não persiste respostas de erro", async () => {
  const w = coverWorker();
  await w.warm([coverUrl(1)]);
  w.advance();
  await w.load(coverUrl(1));
  assert.equal(w.requests.length, 2);
  w.fail();
  await w.warm([coverUrl(2)]);
  assert.equal(w.entries.size, 0);
});
