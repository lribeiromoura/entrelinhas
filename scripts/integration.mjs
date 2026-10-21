import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "entrelinhas-test-"));
// Production validation is explicit and restricted to this app's canonical domain.
const production = process.argv.includes("--production");
const base = production ? "https://entrelinhas-five-iota.vercel.app" : "http://localhost:3101";
const runId = crypto.randomUUID();
const password = production ? crypto.randomUUID() + crypto.randomUUID() : "leitura-segura-123";
const emailFor = name => production ? `qa-${name.toLowerCase()}-${runId}@example.com` : name.toLowerCase() + "@example.com";
const env = {
  ...process.env,
  DATA_DIR: dir,
  CRON_SECRET: "segredo-de-cron-somente-para-teste-isolado-2026",
  DATABASE_URL: "",
  POSTGRES_URL: "",
  DATABASE_MIGRATION_URL: "",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  VERCEL: "",
  BETTER_AUTH_SECRET: "somente-testes-isolados-sem-acesso-ao-banco-real-2026",
  BETTER_AUTH_URL: base,
  NEXT_TELEMETRY_DISABLED: "1",
};
let server;
try {
  if (!production) {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/init-auth.ts"], {
      env,
      stdio: "pipe",
    });
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-p",
        "3101",
        "--hostname",
        "localhost",
      ],
      { env, stdio: "pipe" },
    );
    let logs = "";
    server.stderr.on("data", (d) => (logs += d));
    server.stdout.on("data", (d) => (logs += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
      if (i === 99) throw Error("Servidor não iniciou: " + logs);
    }
  }
  const accounts = [];
  for (const name of ["Ana", "Bruno"]) {
    const r = await fetch(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: base },
      body: JSON.stringify({
        name: production ? "Verificação Entrelinhas · " + name : name,
        email: emailFor(name),
        password,
      }),
    });
    assert.equal(r.status, 200, await r.text());
    accounts.push(
      r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    );
  }
  if (production) {
    mkdirSync("work", { recursive: true });
    writeFileSync("work/production-verification-account.json", JSON.stringify({ email: emailFor("Ana"), password }), { mode: 0o600 });
  }
  const [a, b] = accounts;
  async function get(cookie) {
    const r = await fetch(base + "/api/data", { headers: { cookie } });
    assert.equal(r.status, 200);
    return r.json();
  }
  async function post(cookie, body, status = 200) {
    const r = await fetch(base + "/api/data", {
      method: "POST",
      headers: {
        cookie,
        origin: base,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    assert.equal(r.status, status, await r.text());
  }
  assert.equal((await fetch(base + "/api/data")).status, 401);
  await post(a, {
    action: "book",
    title: production ? "Verificação automática · Livro A" : "Livro A",
    author: "Autora",
    cover_id: 12345,
  });
  await post(a, { action: "book", title: production ? "Verificação automática · Livro B" : "Livro B", author: "Autor" });
  let d = await get(a);
  const [one, two] = d.books;
  assert.equal(one.cover_id, 12345);
  if (!production) {
    assert.equal(one.reading_status, "want");
    for (const status of ["reading", "completed", "paused", "want"]) {
      await post(a, { action: "readingStatus", book: one.id, status });
      assert.equal((await get(a)).books.find(book => book.id === one.id).reading_status, status);
    }
    await post(a, { action: "readingStatus", book: one.id, status: "invalid" }, 400);
    await post(b, { action: "readingStatus", book: one.id, status: "completed" }, 400);
    assert.equal((await get(a)).books.find(book => book.id === one.id).reading_status, "want");
  }
  await post(a, {
    action: "summary",
    book: one.id,
    summary: "Transcrição e resumo persistidos.",
  });
  if (!production || process.argv.includes("--versions")) {
    const endpoint = base + "/api/books/" + one.id + "/summaries";
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { cookie: b } })).status, 404);
    await post(a, { action: "summary", book: one.id, summary: "Resumo revisado para o histórico." });
    const history = await (await fetch(endpoint, { headers: { cookie: a } })).json();
    assert.equal(history.items.length, 2);
    const old = history.items.find(item => item.id !== history.currentId);
    await post(b, { action: "restoreSummary", book: one.id, version: old.id }, 400);
    await post(a, { action: "restoreSummary", book: two.id, version: old.id }, 400);
    await post(a, { action: "restoreSummary", book: one.id, version: old.id });
    assert.equal((await get(a)).books.find(book => book.id === one.id).summary, "Transcrição e resumo persistidos.");
    const after = await (await fetch(endpoint, { headers: { cookie: a } })).json();
    assert.equal(after.items.length, 3);
    console.log("PASS: histórico privado dos resumos e recuperação como atual sem perder versões anteriores.");
  }
  await post(a, {
    action: "idea",
    book: one.id,
    title: "Conceito A",
    description: "Primeira ideia",
  });
  await post(a, {
    action: "idea",
    book: two.id,
    title: "Conceito B",
    description: "Segunda ideia",
  });
  d = await get(a);
  await post(a, {
    action: "connection",
    source: d.ideas[0].id,
    target: d.ideas[1].id,
  });
  await post(
    a,
    { action: "connection", source: d.ideas[0].id, target: d.ideas[0].id },
    400,
  );
  await post(
    a,
    { action: "connection", source: d.ideas[1].id, target: d.ideas[0].id },
    400,
  );
  await post(a, {
    action: "question",
    book: one.id,
    prompt: "O que aprendi?",
    answer: "Uma conexão importante.",
  });
  d = await get(a);
  const q = d.questions[0];
  assert.equal(q.stage, 0);
  assert.ok(q.due > Date.now());
  for (const [rating, stage] of [
    ["good", 1],
    ["hard", 1],
    ["forgot", 0],
  ]) {
    await post(a, { action: "review", id: q.id, rating });
    assert.equal((await get(a)).questions[0].stage, stage);
  }
  await post(a, { action: "review", id: q.id, rating: "bad" }, 400);
  const fd = new FormData();
  fd.set("book", one.id);
  fd.set(
    "photo",
    new Blob([readFileSync("public/icon-192.png")], { type: "image/png" }),
    "note.png",
  );
  await post(a, fd);
  const fd2 = new FormData();
  fd2.set("book", one.id);
  fd2.set("photo", new Blob(["not a png"], { type: "image/png" }), "bad.png");
  await post(a, fd2, 400);
  d = await get(a);
  assert.equal(d.photos.length, 1);
  assert.equal(d.books[0].summary, "Transcrição e resumo persistidos.");
  assert.equal(d.connections.length, 1);
  const cover = new FormData();
  cover.set("book", one.id);
  cover.set("kind", "cover");
  cover.set(
    "photo",
    new Blob([readFileSync("public/icon-192.png")], { type: "image/png" }),
    "cover.png",
  );
  await post(a, cover);
  d = await get(a);
  assert.ok(d.books[0].cover_photo);
  assert.equal(d.photos.length, 1);
  const coverUrl = base + "/api/photos/" + d.books[0].cover_photo;
  assert.equal((await fetch(coverUrl, { headers: { cookie: a } })).status, 200);
  assert.equal((await fetch(coverUrl, { headers: { cookie: b } })).status, 404);
  assert.equal((await fetch(coverUrl)).status, 401);
  await post(b, { action: "findCover", book: one.id }, 400);
  const photo = "/api/photos/" + d.photos[0].id;
  assert.equal(
    (await fetch(base + photo, { headers: { cookie: a } })).status,
    200,
  );
  assert.equal(
    (await fetch(base + photo, { headers: { cookie: b } })).status,
    404,
  );
  assert.equal((await fetch(base + photo)).status, 401);
  assert.deepEqual((await get(b)).books, []);
  for (const body of [
    { action: "summary", book: one.id, summary: "roubado" },
    { action: "idea", book: one.id, title: "x", description: "x" },
    { action: "question", book: one.id, prompt: "x", answer: "x" },
    { action: "review", id: q.id, rating: "good" },
    { action: "connection", source: d.ideas[0].id, target: d.ideas[1].id },
  ])
    await post(b, body, 400);
  const foreign = new FormData();
  foreign.set("book", one.id);
  foreign.set("kind", "cover");
  foreign.set(
    "photo",
    new Blob([readFileSync("public/icon-192.png")], { type: "image/png" }),
    "note.png",
  );
  await post(b, foreign, 400);
  // Editing and trash preserve ownership, children, photos, and review schedules.
  const idea = d.ideas.find(i => i.book === one.id);
  const connection = d.connections[0];
  const photoId = d.photos[0].id;
  const coverId = d.books.find(book => book.id === one.id).cover_photo;
  const scheduled = d.questions[0];
  for (const kind of ["book", "idea", "question", "photo", "connection"]) {
    const id = { book: one.id, idea: idea.id, question: q.id, photo: photoId, connection: connection.id }[kind];
    await post(b, { action: "trash", kind, id }, 400);
    await post(b, { action: "restore", kind, id }, 400);
    await post(b, { action: "edit", kind, id, title: "Invasão", author: "x", description: "x", prompt: "x", answer: "x" }, 400);
  }
  await post(a, { action: "edit", kind: "book", id: one.id, title: "Livro corrigido", author: "Autora corrigida" });
  await post(a, { action: "edit", kind: "idea", id: idea.id, title: "Ideia corrigida", description: "Descrição corrigida" });
  await post(a, { action: "edit", kind: "question", id: q.id, prompt: "Pergunta corrigida", answer: "Resposta corrigida" });
  await post(a, { action: "edit", kind: "book", id: one.id, title: " ", author: "x" }, 400);
  await post(a, { action: "trash", kind: "photo", id: coverId });
  assert.equal((await get(a)).books.find(book => book.id === one.id).cover_photo, null);
  assert.equal((await fetch(coverUrl, { headers: { cookie: a } })).status, 404);
  await post(a, { action: "restore", kind: "photo", id: coverId });
  assert.equal((await get(a)).books.find(book => book.id === one.id).cover_photo, coverId);
  await post(a, { action: "trash", kind: "question", id: q.id });
  await post(a, { action: "review", id: q.id, rating: "good" }, 400);
  await post(a, { action: "trash", kind: "idea", id: idea.id });
  assert.equal((await get(a)).connections.length, 0);
  await post(a, { action: "trash", kind: "connection", id: connection.id });
  await post(a, { action: "restore", kind: "connection", id: connection.id }, 400);
  await post(a, { action: "trash", kind: "book", id: one.id });
  let hidden = await get(a);
  assert.equal(hidden.books.length, 1);
  assert.equal(hidden.photos.length, 0);
  assert.equal((await fetch(base + photo, { headers: { cookie: a } })).status, 404);
  assert.equal((await fetch(coverUrl, { headers: { cookie: a } })).status, 404);
  await post(a, { action: "summary", book: one.id, summary: "oculto" }, 400);
  await post(a, { action: "restore", kind: "question", id: q.id }, 400);
  await post(a, { action: "restore", kind: "book", id: one.id });
  hidden = await get(a);
  assert.equal(hidden.questions.length, 0, "Restaurar livro não restaura pergunta removida separadamente");
  assert.equal(hidden.ideas.some(i => i.id === idea.id), false);
  assert.equal((await fetch(base + photo, { headers: { cookie: a } })).status, 200);
  await post(a, { action: "restore", kind: "question", id: q.id });
  await post(a, { action: "restore", kind: "idea", id: idea.id });
  await post(a, { action: "restore", kind: "connection", id: connection.id });
  await post(a, { action: "trash", kind: "connection", id: connection.id });
  await post(a, { action: "connection", source: idea.id, target: d.ideas.find(i => i.id !== idea.id).id });
  await post(a, { action: "trash", kind: "photo", id: photoId });
  assert.equal((await fetch(base + photo, { headers: { cookie: a } })).status, 404);
  await post(a, { action: "restore", kind: "photo", id: photoId });
  const restored = await get(a);
  assert.equal(restored.trash.length, 0);
  assert.equal(restored.connections.length, 1);
  assert.equal(restored.questions[0].stage, scheduled.stage);
  assert.equal(restored.questions[0].due, scheduled.due);
  assert.equal(restored.questions[0].answer, "Resposta corrigida");
  assert.equal(restored.books.find(book => book.id === one.id).title, "Livro corrigido");
  assert.deepEqual((await get(b)).trash, []);
  if (!production || process.argv.includes("--map")) {
    await post(a, { action: "mapPositions", positions: [{ id: idea.id, x: -175, y: 280 }] });
    assert.equal((await get(a)).ideas.find(row => row.id === idea.id).map_x, -175);
    assert.equal((await get(a)).ideas.find(row => row.id === idea.id).map_y, 280);
    await post(b, { action: "mapPositions", positions: [{ id: idea.id, x: 0, y: 0 }] }, 400);
    await post(a, { action: "mapPositions", positions: [{ id: idea.id, x: 0, y: 0 }, { id: "missing", x: 1, y: 1 }] }, 400);
    assert.equal((await get(a)).ideas.find(row => row.id === idea.id).map_x, -175);
    await post(a, { action: "mapPositions", positions: [{ id: idea.id, x: 1e8, y: 0 }] }, 400);
  }
  if (!production || process.argv.includes("--backup")) {
    // Export hidden records too, then restore into an independent account with existing data.
    await post(a, { action: "question", book: one.id, prompt: "Na lixeira", answer: "Preservar" });
    const extraQuestion = (await get(a)).questions.find(row => row.prompt === "Na lixeira");
    await post(a, { action: "trash", kind: "question", id: extraQuestion.id });
    await post(a, fd);
    const extraPhoto = (await get(a)).photos.find(row => row.id !== photoId);
    await post(a, { action: "trash", kind: "photo", id: extraPhoto.id });
    await post(a, { action: "trash", kind: "book", id: two.id });
    const getBackup = async cookie => {
      const response = await fetch(base + "/api/backup", { headers: { cookie } });
      assert.equal(response.status, 200, await response.clone().text());
      assert.match(response.headers.get("cache-control"), /no-store/);
      return response.json();
    };
    assert.equal((await fetch(base + "/api/backup")).status, 401);
    const archive = await getBackup(a);
    assert.equal(archive.books.length, 2);
    assert.equal(archive.questions.length, 2);
    assert.equal(archive.photos.length, 3);
    assert.ok(archive.books.find(row => row.id === two.id).deleted_at);
    assert.equal(JSON.stringify(archive).includes('"owner":'), false);
    for (const item of archive.photos) {
      const response = await fetch(base + "/api/backup/photo/" + item.id, { headers: { cookie: a } });
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      item.size = bytes.length;
      item.sha256 = createHash("sha256").update(bytes).digest("hex");
      item.data = bytes.toString("base64");
    }
    assert.equal((await fetch(base + "/api/photos/" + extraPhoto.id, { headers: { cookie: a } })).status, 404);
    assert.equal((await fetch(base + "/api/backup/photo/" + extraPhoto.id, { headers: { cookie: b } })).status, 400);
    assert.equal((await fetch(base + "/api/backup/photo/" + extraPhoto.id)).status, 401);
    await post(b, { action: "book", title: "Já existia", author: "Preservar" });
    const manifest = { ...archive, photos: archive.photos.map(({ data, ...photo }) => photo) };
    async function importRequest(cookie, path, body, expected = 200, method = "POST", origin = base, mime = "application/json") {
      const response = await fetch(base + path, { method, headers: { cookie, origin, "Content-Type": mime }, body: Buffer.isBuffer(body) ? body : JSON.stringify(body) });
      assert.equal(response.status, expected, await response.clone().text());
      return response;
    }
    const endpoint = "/api/backup/import";
    await importRequest(b, endpoint, { action: "begin", manifest }, 403, "POST", "https://evil.example");
    await importRequest("", endpoint, { action: "begin", manifest }, 401);
    await importRequest(b, endpoint, { action: "begin", manifest: { ...manifest, version: 999 } }, 400);
    const begun = await (await importRequest(b, endpoint, { action: "begin", manifest })).json();
    assert.equal((await get(b)).books.length, 1, "Nenhum dado visível antes do commit");
    await importRequest(a, endpoint, { action: "commit", id: begun.id }, 400);
    await importRequest(b, endpoint, { action: "commit", id: begun.id }, 400);
    for (const item of archive.photos) {
      const path = `${endpoint}/${begun.id}/photos/${item.id}`;
      await importRequest(b, path, Buffer.from("corrompida"), 400, "PUT", base, item.mime);
      await importRequest(b, path, Buffer.from(item.data, "base64"), 403, "PUT", "https://evil.example", item.mime);
      await importRequest(b, path, Buffer.from(item.data, "base64"), 200, "PUT", base, item.mime);
      await importRequest(b, path, Buffer.from(item.data, "base64"), 200, "PUT", base, item.mime);
    }
    const resumed = await (await importRequest(b, endpoint, { action: "begin", manifest })).json();
    assert.equal(resumed.id, begun.id); assert.equal(resumed.uploaded.length, 3);
    await importRequest(b, endpoint, { action: "commit", id: begun.id });
    const imported = await get(b), exported = await getBackup(b);
    assert.equal(imported.books.length, 2);
    assert.ok(imported.books.some(row => row.title === "Já existia"));
    assert.equal(exported.books.length, 3);
    assert.equal(exported.questions.length, 2);
    assert.equal(exported.photos.length, 3);
    assert.equal(exported.ideas.find(row => row.title === "Ideia corrigida").map_x, -175);
    assert.equal(Number(exported.questions.find(row => row.prompt === "Pergunta corrigida").due), scheduled.due);
    const importedPhoto = imported.photos[0];
    assert.equal((await fetch(base + "/api/photos/" + importedPhoto.id, { headers: { cookie: b } })).status, 200);
    assert.equal((await fetch(base + "/api/photos/" + importedPhoto.id, { headers: { cookie: a } })).status, 404);
    const replay = await (await importRequest(b, endpoint, { action: "commit", id: begun.id })).json();
    assert.equal(replay.alreadyImported, true);
    assert.equal((await get(b)).books.length, 2);
    assert.equal((await (await importRequest(b, endpoint, { action: "begin", manifest })).json()).complete, true);
    if (!production) {
      mkdirSync("work", { recursive: true });
      writeFileSync("work/backup-verification.json", JSON.stringify(archive));
    }
    await post(a, { action: "restore", kind: "book", id: two.id });
    console.log("PASS: backup com fotos e lixeira, restauração aditiva, agenda, retomada, idempotência, autenticação, CSRF e isolamento entre contas.");
  }
  const csrf = await fetch(base + "/api/data", {
    method: "POST",
    headers: {
      cookie: a,
      origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "book", title: "x", author: "x" }),
  });
  assert.equal(csrf.status, 403);
  await fetch(base + "/api/auth/sign-out", {
    method: "POST",
    headers: { cookie: a, origin: base, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(
    (await fetch(base + "/api/data", { headers: { cookie: a } })).status,
    401,
  );
  const login = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailFor("Ana"),
      password,
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal((await get(cookie)).books.length, 2);
  if (!production || process.argv.includes("--trash")) {
    await post(cookie, { action: "book", title: "Livro descartável", author: "Teste da lixeira" });
    const disposable = (await get(cookie)).books.find(row => row.title === "Livro descartável");
    await post(cookie, { action: "purge", kind: "book", id: disposable.id }, 400);
    await post(cookie, { action: "trash", kind: "book", id: disposable.id });
    await post(b, { action: "purge", kind: "book", id: disposable.id }, 400);
    await post(cookie, { action: "purge", kind: "book", id: disposable.id });
    await post(cookie, { action: "restore", kind: "book", id: disposable.id }, 400);
    assert.equal((await get(cookie)).trash.some(row => row.id === disposable.id), false);
    if (!production) {
      assert.equal((await fetch(base + "/api/cron/trash")).status, 401);
      const sweep = await fetch(base + "/api/cron/trash", { headers: { authorization: "Bearer " + env.CRON_SECRET } });
      assert.equal(sweep.status, 200);
    }
    console.log("PASS: exclusão definitiva restrita à lixeira e ao proprietário; restauração posterior recusada; cron protegido.");
  }
  const manifest = await (await fetch(base + "/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
  if (production) {
    writeFileSync("work/production-verification-result.json", JSON.stringify({
      origin: base, verifiedAt: new Date().toISOString(), result: "passed",
      checks: ["cadastro", "login", "logout", "persistência", "edição", "lixeira", "restauração", "fotos privadas", "isolamento entre contas", "CSRF", "agenda de revisões", "manifesto"],
    }, null, 2));
  }
  console.log(
    "PASS: cadastro, login, logout, livros, resumo, fotos, ideias, conexões, revisões, edição, lixeira e restauração com fotos privadas e agenda preservada, CSRF, isolamento de duas contas e manifesto.",
  );
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
  rmSync(dir, { recursive: true, force: true });
}
