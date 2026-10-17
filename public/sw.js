// No private data or authenticated pages are cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
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
