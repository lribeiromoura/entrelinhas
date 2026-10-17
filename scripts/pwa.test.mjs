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
