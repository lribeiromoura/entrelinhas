import { saveMapLayout } from "../lib/map-layout.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { postgresParameters } from "../lib/sql-parameters.ts";
import {
  createPrivateStorage,
  maxPhotoBytes,
} from "../lib/storage-provider.ts";
import { normalizePhoto } from "../lib/normalize-photo.ts";
import { optimizePhoto } from "../lib/optimize-photo.ts";
import { restrictSchema } from "../lib/restrict-schema.ts";
test("parâmetros PostgreSQL preservam texto literal e identificadores", () => {
  assert.equal(
    postgresParameters(
      `SELECT '?' as "?", id FROM books WHERE owner=? AND title=?`,
    ),
    `SELECT '?' as "?", id FROM books WHERE owner=$1 AND title=$2`,
  );
  assert.equal(
    postgresParameters("SELECT 'It''s ?' WHERE id=?"),
    "SELECT 'It''s ?' WHERE id=$1",
  );
});
test("schema PostgreSQL persiste livros, imagens, ideias, conexões e revisão", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE \"user\"(id TEXT PRIMARY KEY); INSERT INTO \"user\" VALUES ('ana'),('bruno');",
    );
    await db.exec(readFileSync("supabase/app-schema.sql", "utf8"));
    await db.exec(readFileSync("supabase/app-schema.sql", "utf8")); // idempotent setup
    await db.query(
      postgresParameters(
        "INSERT INTO books(id,owner,title,author) VALUES(?,?,?,?)",
      ),
      ["a", "ana", "Um livro", "Uma autora"],
    );
    await db.query(postgresParameters("INSERT INTO ideas VALUES(?,?,?,?,?)"), [
      "i",
      "ana",
      "a",
      "Uma ideia",
      "Descrição",
    ]);
    await db.query(postgresParameters("INSERT INTO ideas VALUES(?,?,?,?,?)"), [
      "j",
      "ana",
      "a",
      "Outra ideia",
      "Conexão",
    ]);
    await db.query(
      postgresParameters("INSERT INTO connections VALUES(?,?,?,?)"),
      ["c", "ana", "i", "j"],
    );
    const mapStore = {
      all: async (sql, ...args) => (await db.query(postgresParameters(sql), args)).rows,
      run: async (sql, ...args) => { await db.query(postgresParameters(sql), args); },
      transaction: fn => db.transaction(tx => fn({
        all: async (sql, ...args) => (await tx.query(postgresParameters(sql), args)).rows,
        run: async (sql, ...args) => { await tx.query(postgresParameters(sql), args); },
      })),
    };
    await saveMapLayout(mapStore, "ana", [{ id: "i", x: -50, y: 120 }, { id: "j", x: 200, y: 300 }]);
    assert.deepEqual((await db.query("SELECT map_x,map_y FROM ideas WHERE id='i'")).rows[0], { map_x: -50, map_y: 120 });
    await assert.rejects(() => saveMapLayout(mapStore, "bruno", [{ id: "i", x: 0, y: 0 }]));
    const due = Date.now() + 86400000;
    await db.query(
      postgresParameters("INSERT INTO questions VALUES(?,?,?,?,?,?,?)"),
      ["q", "ana", "a", "Pergunta", "Resposta", 0, due],
    );
    await db.query(
      postgresParameters(
        "INSERT INTO photos(id,owner,book,mime,bytes,kind,storage_path) VALUES(?,?,?,?,?,?,?)",
      ),
      ["p", "ana", "a", "image/jpeg", null, "note", "ana/p"],
    );
    assert.equal(
      (
        await db.query("SELECT storage_path FROM photos WHERE owner=$1", [
          "ana",
        ])
      ).rows[0].storage_path,
      "ana/p",
    );
    assert.equal(
      (await db.query("SELECT * FROM books WHERE owner=$1", ["bruno"])).rows
        .length,
      0,
    );
    assert.equal(
      Number(
        (await db.query("SELECT due FROM questions WHERE owner=$1", ["ana"]))
          .rows[0].due,
      ),
      due,
    );
    await assert.rejects(() =>
      db.query("INSERT INTO connections VALUES ($1,$2,$3,$4)", [
        "duplicate",
        "ana",
        "i",
        "j",
      ]),
    );
    await assert.rejects(() =>
      db.query("INSERT INTO ideas VALUES ($1,$2,$3,$4,$5)", [
        "invalid",
        "ana",
        "missing",
        "x",
        "x",
      ]),
    );
  } finally {
    await db.close();
  }
});
function fixture({
  publicBucket = false,
  bucketError = null,
  uploadError = null,
  downloadError = null,
} = {}) {
  const calls = [];
  const api = {
    storage: {
      getBucket: async () => ({
        data: { public: publicBucket },
        error: bucketError,
      }),
      createBucket: async (name, options) => {
        calls.push(["create", name, options]);
        return { error: null };
      },
      from: (bucket) => ({
        upload: async (path, bytes, options) => {
          calls.push(["upload", bucket, path, options]);
          return { error: uploadError };
        },
        remove: async () => ({ error: null }),
        download: async (path) => {
          calls.push(["download", bucket, path]);
          return { data: new Blob(["photo"]), error: downloadError };
        },
      }),
    },
  };
  return { storage: createPrivateStorage(api, "private"), calls };
}
test("armazenamento recusa bucket público e cria somente bucket privado", async () => {
  await assert.rejects(
    () => fixture({ publicBucket: true }).storage.prepare(),
    /privado/,
  );
  const f = fixture({ bucketError: { statusCode: "404" } });
  await f.storage.prepare();
  assert.equal(f.calls[0][2].public, false);
  assert.equal(f.calls[0][2].fileSizeLimit, maxPhotoBytes);
  await assert.rejects(
    () => fixture({ bucketError: { statusCode: "401" } }).storage.prepare(),
    /verificar/,
  );
});
test("upload privado usa caminho do proprietário e não sobrescreve arquivos", async () => {
  const f = fixture();
  assert.equal(
    await f.storage.upload("ana", "id", "image/jpeg", Buffer.from("x")),
    "ana/id",
  );
  assert.equal(f.calls[0][3].upsert, false);
  await assert.rejects(
    () =>
      fixture({ uploadError: Error("offline") }).storage.upload(
        "ana",
        "id",
        "image/jpeg",
        Buffer.from("x"),
      ),
    /preservado/,
  );
});
test("download não aceita caminho de outro usuário nem traversal", async () => {
  const f = fixture();
  await assert.rejects(() => f.storage.download("bruno/id", "ana"));
  await assert.rejects(() => f.storage.download("ana/../bruno/id", "ana"));
  assert.equal(f.calls.length, 0);
  assert.ok(await f.storage.download("ana/id", "ana"));
  await assert.rejects(
    () =>
      fixture({ downloadError: Error("offline") }).storage.download(
        "ana/id",
        "ana",
      ),
    /temporariamente/,
  );
});
test("fotos são decodificadas, orientadas e salvas sem EXIF", async () => {
  const original = await sharp({
    create: { width: 3200, height: 1600, channels: 3, background: "#fafafa" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const normalized = await normalizePhoto(original);
  const meta = await sharp(normalized.bytes).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok(Math.max(meta.width, meta.height) <= 2400);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.ok(normalized.bytes.length <= maxPhotoBytes);
  await assert.rejects(
    () => normalizePhoto(Buffer.from([255, 216, 0, 1])),
    /válida/,
  );
});
test("fotos pequenas não exigem canvas no navegador; tipos inválidos são recusados", async () => {
  const f = new File([readFileSync("public/icon-192.png")], "note.png", {
    type: "image/png",
  });
  assert.equal(await optimizePhoto(f), f);
  await assert.rejects(
    () => optimizePhoto(new File(["x"], "x.svg", { type: "image/svg+xml" })),
    /JPEG/,
  );
});

test("tabelas e contas não são acessíveis pelos papéis públicos do Supabase", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "user"(id TEXT PRIMARY KEY);CREATE TABLE session(id TEXT);CREATE TABLE account(id TEXT);CREATE TABLE verification(id TEXT);',
    );
    await db.exec(readFileSync("supabase/app-schema.sql", "utf8"));
    await db.exec(
      "INSERT INTO \"user\" VALUES ('ana');INSERT INTO books(id,owner,title,author) VALUES('book','ana','Privado','Autora');",
    );
    await restrictSchema(db);
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role);
      await assert.rejects(() => db.query("SELECT * FROM books"));
      await assert.rejects(() => db.query('SELECT * FROM \"user\"'));
      await assert.rejects(() => db.query("SELECT * FROM backup_imports"));
      await assert.rejects(() => db.query("SELECT * FROM backup_import_photos"));
      await db.exec("RESET ROLE");
    }
    assert.equal((await db.query("SELECT * FROM books")).rows.length, 1);
  } finally {
    await db.close();
  }
});
