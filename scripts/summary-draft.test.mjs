import { test } from "node:test";
import assert from "node:assert/strict";
import { readDraft, draftKey, acknowledgeDraft, clearOwnerDrafts, hasOwnerDrafts } from "../lib/summary-draft.ts";
function storage() {
  const map = new Map();
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
    getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
test("Rascunho vazio é recuperável e conta/livro têm chaves distintas", () => {
  const s = storage(), key = draftKey("a", "b");
  s.setItem(key, JSON.stringify({ text: "", base: "resumo original" }));
  assert.equal(readDraft(s, key).text, "");
  assert.equal(readDraft(s, draftKey("c", "b")), null);
  assert.notEqual(draftKey("a:b", "c"), draftKey("a", "b:c"));
  s.setItem(key, "malformed");
  assert.equal(readDraft(s, key), null);
});
test("Confirmação de salvamento mantém digitação mais recente e limpa somente texto confirmado", () => {
  const s = storage(), key = draftKey("a", "b");
  s.setItem(key, JSON.stringify({ text: "mais recente", base: "original" }));
  acknowledgeDraft(s, key, "enviado");
  assert.deepEqual(readDraft(s, key), { text: "mais recente", base: "enviado" });
  acknowledgeDraft(s, key, "mais recente");
  assert.equal(readDraft(s, key), null);
});
test("Saída limpa somente rascunhos da conta atual", () => {
  const s = storage();
  for (const [owner, book] of [["a", "1"], ["a", "2"], ["ab", "1"]])
    s.setItem(draftKey(owner, book), JSON.stringify({ text: "x", base: "" }));
  s.setItem("unrelated", "value");
  assert.equal(hasOwnerDrafts(s, "a"), true);
  clearOwnerDrafts(s, "a");
  assert.equal(hasOwnerDrafts(s, "a"), false);
  assert.equal(s.length, 2);
  assert.equal(readDraft(s, draftKey("ab", "1")).text, "x");
  assert.equal(s.getItem("unrelated"), "value");
});
