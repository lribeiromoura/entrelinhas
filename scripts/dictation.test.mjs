import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDictation,
  appendDictation,
  speechError,
} from "../lib/dictation.ts";
function fixture() {
  const instances = [];
  const states = [];
  const previews = [];
  const chunks = [];
  const controller = createDictation(
    () => {
      const rec = {
        startCalls: 0,
        stopCalls: 0,
        abortCalls: 0,
        start() {
          this.startCalls++;
        },
        stop() {
          this.stopCalls++;
        },
        abort() {
          this.abortCalls++;
        },
      };
      instances.push(rec);
      return rec;
    },
    {
      onText: (t) => chunks.push(t),
      onInterim: (t) => previews.push(t),
      onState: (s, m) => states.push([s, m]),
    },
  );
  return { controller, instances, states, previews, chunks };
}
const result = (text, isFinal) => ({ 0: { transcript: text }, isFinal });
test("ditado usa português e só inicia por comando explícito", () => {
  const f = fixture();
  assert.equal(f.instances.length, 0);
  f.controller.start();
  const r = f.instances[0];
  assert.equal(r.lang, "pt-BR");
  assert.equal(r.continuous, true);
  assert.equal(r.interimResults, true);
  assert.equal(r.startCalls, 1);
  f.controller.start();
  assert.equal(f.instances.length, 1);
  r.onstart();
  assert.equal(f.states.at(-1)[0], "listening");
  f.controller.dispose();
});
test("trechos provisórios são separados; finais são acrescentados uma única vez", () => {
  const f = fixture();
  f.controller.start();
  const r = f.instances[0];
  r.onresult({ resultIndex: 0, results: [result("Uma ideia", false)] });
  assert.deepEqual(f.chunks, []);
  assert.equal(f.previews.at(-1), "Uma ideia");
  r.onresult({ resultIndex: 0, results: [result("Uma ideia.", true)] });
  r.onresult({
    resultIndex: 1,
    results: [result("Uma ideia.", true), result("Outra ideia.", true)],
  });
  r.onend();
  assert.deepEqual(f.chunks, ["Uma ideia.", "Outra ideia."]);
  f.controller.dispose();
});
test("acrescentar ditado preserva texto anterior, quebras e correções manuais", () => {
  assert.equal(
    appendDictation("Meu resumo.", " Mais uma ideia. "),
    "Meu resumo. Mais uma ideia.",
  );
  assert.equal(
    appendDictation("Meu resumo.\n", "Outro ponto."),
    "Meu resumo.\nOutro ponto.",
  );
  assert.equal(appendDictation("Correção manual", ""), "Correção manual");
  assert.equal(appendDictation("", "Começo."), "Começo.");
});
test("parar preserva o último trecho provisório para revisão", () => {
  const f = fixture();
  f.controller.start();
  const r = f.instances[0];
  r.onresult({ resultIndex: 0, results: [result("Última frase", false)] });
  f.controller.stop();
  assert.equal(r.stopCalls, 1);
  assert.equal(f.states.at(-1)[0], "stopping");
  r.onend();
  assert.deepEqual(f.chunks, ["Última frase"]);
  assert.equal(f.states.at(-1)[0], "idle");
  f.controller.dispose();
});
test("erro de rede preserva o texto e permite nova tentativa sem evento end", () => {
  const f = fixture();
  f.controller.start();
  const r = f.instances[0];
  r.onresult({ resultIndex: 0, results: [result("Trecho recebido", false)] });
  r.onerror({ error: "network" });
  assert.deepEqual(f.chunks, ["Trecho recebido"]);
  assert.equal(f.states.at(-1)[0], "error");
  assert.match(f.states.at(-1)[1], /conexão/);
  f.controller.start();
  assert.equal(f.instances.length, 2);
  r.onresult({ resultIndex: 0, results: [result("Evento antigo", true)] });
  assert.equal(f.chunks.length, 1);
  f.controller.dispose();
});
test("permissão negada tem explicação em português e não apaga conteúdo", () => {
  const f = fixture();
  f.controller.start();
  f.instances[0].onerror({ error: "not-allowed" });
  assert.match(f.states.at(-1)[1], /Permissão do microfone negada/);
  assert.deepEqual(f.chunks, []);
  f.controller.dispose();
});
test("sair do livro aborta captura e ignora eventos tardios de outra sessão", () => {
  const f = fixture();
  f.controller.start();
  const r = f.instances[0];
  f.controller.dispose();
  assert.equal(r.abortCalls, 1);
  const count = f.states.length;
  r.onstart();
  r.onresult({
    resultIndex: 0,
    results: [result("Não deve entrar em outro livro", true)],
  });
  r.onerror({ error: "network" });
  r.onend();
  f.controller.start();
  assert.deepEqual(f.chunks, []);
  assert.equal(f.states.length, count);
  assert.equal(f.instances.length, 1);
});
test("falha ao iniciar permite recuperação sem deixar o estado ocupado", () => {
  let count = 0;
  const states = [];
  const c = createDictation(
    () => {
      count++;
      throw Error("unavailable");
    },
    { onText: () => {}, onInterim: () => {}, onState: (s) => states.push(s) },
  );
  c.start();
  c.start();
  assert.equal(count, 2);
  assert.deepEqual(states, ["error", "error"]);
  c.dispose();
});
test("mensagens cobrem microfone, idioma, silêncio e serviço bloqueado", () => {
  for (const code of [
    "audio-capture",
    "language-not-supported",
    "no-speech",
    "service-not-allowed",
    "unknown",
  ])
    assert.ok(speechError(code).length > 20);
});
