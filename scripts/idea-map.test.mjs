import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { fitMap, zoomMap, screenToMap, initialPositions, gridPositions, validPosition, nodeWidth, nodeHeight, minZoom, maxZoom } from "../lib/idea-map.ts";
import { saveMapLayout } from "../lib/map-layout.ts";
const ideas = [{ id: "one", title: "Uma ideia", book: "book", description: "Descrição", map_x: -240, map_y: 500 }, { id: "two", title: "Outra ideia", book: "book", description: "Descrição" }];
test("Mapa mantém posições salvas e organiza ideias novas deterministicamente", () => {
  const positions = initialPositions(ideas);
  assert.deepEqual(positions.one, { x: -240, y: 500 });
  assert.deepEqual(positions.two, gridPositions(ideas).two);
  assert.deepEqual(gridPositions([...ideas].reverse()), gridPositions(ideas));
  assert.equal(validPosition(Infinity, 1), false);
  assert.equal(validPosition(0, NaN), false);
  assert.equal(validPosition(100001, 0), false);
});
test("Zoom preserva o ponto de ancoragem e respeita limites", () => {
  const view = { zoom: 0.75, x: -120, y: 45 }, anchor = { x: 300, y: 200 };
  assert.deepEqual(screenToMap(anchor, view), screenToMap(anchor, zoomMap(view, 2, anchor)));
  assert.equal(zoomMap(view, 1000, anchor).zoom, maxZoom);
  assert.equal(zoomMap(view, 0.000001, anchor).zoom, minZoom);
});
test("Ver todas enquadra coordenadas negativas e nós distantes em telas pequenas", () => {
  const points = [{ x: -100000, y: -5000 }, { x: 100000, y: 3000 }];
  for (const width of [320, 900]) {
    const view = fitMap(points, width, 420);
    for (const point of points) {
      assert.ok(point.x * view.zoom + view.x >= 24);
      assert.ok((point.x + nodeWidth) * view.zoom + view.x <= width - 24);
      assert.ok(point.y * view.zoom + view.y >= 24);
      assert.ok((point.y + nodeHeight) * view.zoom + view.y <= 420 - 24);
    }
  }
});
test("Salvar layout é atômico e recusa ideias de outras contas ou na lixeira", async () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE books(id TEXT,owner TEXT,deleted_at INTEGER);CREATE TABLE ideas(id TEXT PRIMARY KEY,owner TEXT,book TEXT,deleted_at INTEGER,map_x INTEGER,map_y INTEGER);INSERT INTO books VALUES('a','ana',NULL),('b','bruno',NULL),('hidden','ana',1);INSERT INTO ideas VALUES('one','ana','a',NULL,NULL,NULL),('two','ana','a',NULL,NULL,NULL),('foreign','bruno','b',NULL,NULL,NULL),('deleted','ana','a',1,NULL,NULL),('hidden-child','ana','hidden',NULL,NULL,NULL);");
  const store = { all: async (sql, ...args) => db.prepare(sql).all(...args), run: async (sql, ...args) => { db.prepare(sql).run(...args); }, transaction: async fn => { db.exec("BEGIN"); try { await fn(store); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; } } };
  try {
    await saveMapLayout(store, "ana", [{ id: "one", x: -45.4, y: 120.2 }, { id: "two", x: 60, y: 70 }]);
    assert.deepEqual(db.prepare("SELECT map_x,map_y FROM ideas WHERE id='one'").get(), { map_x: -45, map_y: 120 });
    for (const id of ["foreign", "deleted", "hidden-child"]) await assert.rejects(() => saveMapLayout(store, "ana", [{ id: "one", x: 0, y: 0 }, { id, x: 1, y: 1 }]), /não está disponível/);
    assert.equal(db.prepare("SELECT map_x FROM ideas WHERE id='one'").get().map_x, -45);
    await assert.rejects(() => saveMapLayout(store, "ana", [{ id: "one", x: 1, y: 1 }, { id: "one", x: 2, y: 2 }]));
    await assert.rejects(() => saveMapLayout(store, "ana", [{ id: "one", x: "1", y: 0 }]));
    await assert.rejects(() => saveMapLayout(store, "ana", [{ id: "one", x: 0, y: Infinity }]));
  } finally { db.close(); }
});
