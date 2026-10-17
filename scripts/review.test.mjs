import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule } from "../lib/review.mjs";
test("boa recordação avança e fica em 30 dias", () => {
  for (let i = 0; i < 5; i++) {
    const n = schedule(i, "good", 0);
    assert.equal(n.stage, Math.min(i + 1, 4));
    assert.equal(n.due, [3, 7, 14, 30, 30][i] * 86400000);
  }
});
test("dificuldade mantém e esquecimento retorna a um dia", () => {
  for (let i = 0; i < 5; i++) {
    assert.equal(schedule(i, "hard", 0).stage, i);
    assert.deepEqual(schedule(i, "forgot", 0), { stage: 0, due: 86400000 });
  }
});
test("avaliação inválida é recusada", () =>
  assert.throws(() => schedule(0, "invalid")));
