import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { parseBackup, withoutPhotoData, maxBackupPhotoBytes } from "../lib/backup-format.ts";
import { createBackupService } from "../lib/backup-service.ts";
import { photoBase64, photoBytes, readBackup } from "../lib/backup-client.ts";
import { validPhotoSignature } from "../lib/photo-signature.ts";
import { postgresParameters } from "../lib/sql-parameters.ts";
const bytes = readFileSync("public/icon-192.png");
const digest = createHash("sha256").update(bytes).digest("hex");
function fixture() {
  return {
    format: "entrelinhas", version: 1, createdAt: "2026-10-19T12:00:00Z",
    books: [{ id: "book", title: "Livro", author: "Autora", summary: "Resumo", cover_id: 123, cover_photo: "cover", deleted_at: null }, { id: "trashed-book", title: "Na lixeira", author: "Autor", summary: "Preservar", cover_id: null, cover_photo: null, deleted_at: 1234 }],
    summaryVersions: [{ id: "v1", book: "book", summary: "Resumo antigo", created_at: 1700000000000 }, { id: "v2", book: "book", summary: "Resumo", created_at: 1700000000001 }],
    ideas: [{ id: "i1", book: "book", title: "Ideia 1", description: "Descrição 1", deleted_at: null, map_x: -125, map_y: 360 }, { id: "i2", book: "trashed-book", title: "Ideia 2", description: "Descrição 2", deleted_at: 4321 }],
    connections: [{ id: "c1", source: "i1", target: "i2", deleted_at: 5678 }],
    questions: [{ id: "q1", book: "book", prompt: "Pergunta", answer: "Resposta", stage: 3, due: 1800000000000, deleted_at: null }],
    photos: ["cover", "note", "trashed-photo"].map(id => ({ id, book: id === "trashed-photo" ? "trashed-book" : "book", kind: id === "cover" ? "cover" : "note", mime: "image/png", deleted_at: id === "trashed-photo" ? 9876 : null, size: bytes.length, sha256: digest, data: bytes.toString("base64") })),
  };
}
test("Backup valida vínculos, versão, tamanhos e campos sem importar credenciais", () => {
  const input = fixture(); input.owner = "Outra pessoa"; input.password = "não importar";
  assert.equal(parseBackup(input).owner, undefined);
  assert.equal(parseBackup(input).password, undefined);
  assert.equal(parseBackup(input).photos[0].data, undefined);
  assert.deepEqual(photoBytes(photoBase64(bytes)), new Uint8Array(bytes));
  for (const change of [
    b => b.version = 2,
    b => b.books.push(b.books[0]),
    b => b.ideas[0].book = "ausente",
    b => b.summaryVersions[0].book = "ausente",
    b => b.books[0].cover_photo = "note",
    b => b.questions[0].stage = 5,
    b => b.questions[0].due = -1,
    b => b.connections[0].target = "i1",
    b => b.connections.push({ ...b.connections[0], id: "other", source: "i2", target: "i1" }),
    b => b.photos[0].mime = "image/svg+xml",
    b => b.photos[0].size = maxBackupPhotoBytes + 1,
    b => b.photos[0].data = "incompleto",
  ]) { const bad = structuredClone(fixture()); change(bad); assert.throws(() => parseBackup(bad, true)); }
});
test("Importação recusa conteúdo ativo e formatos diferentes do declarado", () => {
  assert.equal(validPhotoSignature("image/png", Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")), false);
  assert.equal(validPhotoSignature("image/jpeg", bytes), false);
  assert.equal(validPhotoSignature("image/png", bytes), true);
});
test("Leitura do arquivo detecta corrupção antes de enviar fotos ao servidor", async () => {
  const archive = fixture();
  assert.equal((await readBackup(new File([JSON.stringify(archive)], "backup.json"), () => {})).books.length, 2);
  archive.photos[0].sha256 = "0".repeat(64);
  await assert.rejects(() => readBackup(new File([JSON.stringify(archive)], "backup.json"), () => {}), /alterada/);
  await assert.rejects(() => readBackup(new File(["inválido"], "backup.json"), () => {}), /JSON/);
});
async function adapter(kind) {
  if (kind === "postgres") {
    const pg = new PGlite();
    await pg.exec('CREATE TABLE "user"(id TEXT PRIMARY KEY); INSERT INTO "user" VALUES (\'ana\'),(\'bruno\');');
    await pg.exec(readFileSync("supabase/app-schema.sql", "utf8"));
    const store = {
      all: async (sql, ...args) => (await pg.query(postgresParameters(sql), args)).rows,
      get: async (sql, ...args) => (await pg.query(postgresParameters(sql), args)).rows[0],
      run: async (sql, ...args) => { await pg.query(postgresParameters(sql), args); },
      transaction: fn => pg.transaction(tx => fn({ ...store,
        all: async (sql, ...args) => (await tx.query(postgresParameters(sql), args)).rows,
        get: async (sql, ...args) => (await tx.query(postgresParameters(sql), args)).rows[0],
        run: async (sql, ...args) => { await tx.query(postgresParameters(sql), args); },
      })),
    };
    return { store, close: () => pg.close() };
  }
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  // Mirror the real schema without touching the user's local database.
  const sql = readFileSync("supabase/app-schema.sql", "utf8")
    .replaceAll(" ADD COLUMN IF NOT EXISTS ", " ADD COLUMN ")
    .replace(/REFERENCES "user"\(id\) ON DELETE CASCADE/g, "").replaceAll("BYTEA", "BLOB");
  sqlite.exec(sql);
  const store = {
    all: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    get: async (sql, ...args) => sqlite.prepare(sql).get(...args),
    run: async (sql, ...args) => { sqlite.prepare(sql).run(...args); },
    transaction: async fn => { sqlite.exec("BEGIN IMMEDIATE"); try { const result = await fn(store); sqlite.exec("COMMIT"); return result; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } },
  };
  return { store, close: async () => sqlite.close() };
}
for (const kind of ["sqlite", "postgres"]) test(`Restauração ${kind}: fotos, lixeira, agenda, isolamento, retomada e idempotência`, async () => {
  const { store, close } = await adapter(kind);
  const blobs = new Map();
  const files = { upload: async (owner, id, mime, bytes) => { if (kind === "sqlite") return null; const path = `${owner}/${id}`; blobs.set(path, bytes); return path; }, remove: async path => { blobs.delete(path); }, download: async (path, owner) => { assert.ok(path.startsWith(owner + "/")); return blobs.get(path); } };
  const service = createBackupService(store, files);
  try {
    await store.run("INSERT INTO books(id,owner,title,author,summary) VALUES(?,?,?,?,?)", "existing", "ana", "Existente", "Autor", "Não alterar");
    const original = fixture(), manifest = withoutPhotoData(parseBackup(original, true));
    const job = await service.begin("ana", manifest);
    assert.equal(job.complete, false);
    assert.deepEqual(job.uploaded, []);
    await assert.rejects(() => service.commit("ana", job.id), /faltam fotos/);
    assert.equal((await service.metadata("ana")).books.length, 1);
    await assert.rejects(() => service.commit("bruno", job.id), /não foi encontrada/);
    await assert.rejects(() => service.upload("bruno", job.id, "cover", bytes, "image/png"));
    await assert.rejects(() => service.upload("ana", job.id, "cover", Buffer.from("corrompido"), "image/png"), /não corresponde/);
    await service.upload("ana", job.id, "cover", bytes, "image/png");
    const resumed = await service.begin("ana", manifest);
    assert.equal(resumed.id, job.id); assert.deepEqual(resumed.uploaded, ["cover"]);
    await service.upload("ana", job.id, "cover", bytes, "image/png");
    for (const id of ["note", "trashed-photo"]) await service.upload("ana", job.id, id, bytes, "image/png");
    const result = await service.commit("ana", job.id);
    assert.equal(result.alreadyImported, false); assert.equal(result.counts.photos, 3);
    const restored = await service.metadata("ana");
    assert.equal(restored.books.length, 3);
    assert.deepEqual(restored.summaryVersions.map(row => row.summary), ["Resumo antigo", "Resumo"]);
    assert.ok(restored.summaryVersions.every(row => row.book === restored.books.find(book => book.title === "Livro").id));
    assert.equal(restored.books.find(b => b.id === "existing").summary, "Não alterar");
    assert.equal(restored.ideas.find(row => row.title === "Ideia 1").map_x, -125);
    assert.equal(restored.ideas.find(row => row.title === "Ideia 1").map_y, 360);
    assert.equal(restored.questions[0].stage, 3); assert.equal(Number(restored.questions[0].due), 1800000000000);
    assert.equal(Number(restored.books.find(b => b.title === "Na lixeira").deleted_at), 1234);
    assert.equal(Number(restored.ideas.find(b => b.title === "Ideia 2").deleted_at), 4321);
    assert.equal(Number(restored.connections[0].deleted_at), 5678);
    assert.equal(restored.photos.some(p => p.id === "cover"), false);
    const cover = restored.photos.find(p => p.id === restored.books.find(b => b.title === "Livro").cover_photo);
    assert.equal(cover.kind, "cover");
    assert.ok((await service.photo("ana", cover.id)).bytes.length > 0);
    await assert.rejects(() => service.photo("bruno", cover.id), /não encontrada/);
    assert.deepEqual((await service.metadata("bruno")).books, []);
    assert.equal((await service.begin("ana", manifest)).complete, true);
    assert.equal((await service.commit("ana", job.id)).alreadyImported, true);
    assert.equal((await service.metadata("ana")).books.length, 3);
    assert.equal((await store.all("SELECT * FROM backup_import_photos")).length, 0);
    // Importing this archive into another account creates independent IDs and private files.
    const other = await service.begin("bruno", manifest);
    for (const photo of manifest.photos) await service.upload("bruno", other.id, photo.id, bytes, photo.mime);
    await service.commit("bruno", other.id);
    const bruno = await service.metadata("bruno");
    assert.equal(bruno.books.length, 2);
    assert.ok(bruno.books.every(b => !restored.books.some(a => a.id === b.id)));
    // A database failure at commit rolls back even books inserted earlier in the transaction.
    const next = { ...manifest, createdAt: "2026-10-20T12:00:00Z" };
    const failingJob = await service.begin("ana", next);
    for (const photo of next.photos) await service.upload("ana", failingJob.id, photo.id, bytes, photo.mime);
    const brokenStore = { ...store, transaction: fn => store.transaction(tx => fn({ ...tx, run: async (sql, ...args) => { if (sql.startsWith("INSERT INTO ideas")) throw Error("Falha simulada"); return tx.run(sql, ...args); } })) };
    await assert.rejects(() => createBackupService(brokenStore, files).commit("ana", failingJob.id), /simulada/);
    assert.equal((await service.metadata("ana")).books.length, 3);
    await service.commit("ana", failingJob.id);
    assert.equal((await service.metadata("ana")).books.length, 5);
    const expiring = await service.begin("ana", { ...manifest, createdAt: "2026-10-21T12:00:00Z" });
    await service.upload("ana", expiring.id, "cover", bytes, "image/png");
    const previousBlobCount = blobs.size;
    await store.run("UPDATE backup_imports SET expires=0 WHERE id=?", expiring.id);
    await assert.rejects(() => service.commit("ana", expiring.id), /expirou/);
    const fresh = await service.begin("ana", { ...manifest, createdAt: "2026-10-21T12:00:00Z" });
    assert.notEqual(fresh.id, expiring.id); assert.equal(fresh.uploaded.length, 0);
    if (kind === "postgres") assert.equal(blobs.size, previousBlobCount - 1);
  } finally { await close(); }
});
