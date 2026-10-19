import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "entrelinhas-test-"));
const base = "http://localhost:3101";
const env = {
  ...process.env,
  DATA_DIR: dir,
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
  const accounts = [];
  for (const name of ["Ana", "Bruno"]) {
    const r = await fetch(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: base },
      body: JSON.stringify({
        name,
        email: name.toLowerCase() + "@example.com",
        password: "leitura-segura-123",
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
    title: "Livro A",
    author: "Autora",
    cover_id: 12345,
  });
  await post(a, { action: "book", title: "Livro B", author: "Autor" });
  let d = await get(a);
  const [one, two] = d.books;
  assert.equal(one.cover_id, 12345);
  await post(a, {
    action: "summary",
    book: one.id,
    summary: "Transcrição e resumo persistidos.",
  });
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
      email: "ana@example.com",
      password: "leitura-segura-123",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal((await get(cookie)).books.length, 2);
  const manifest = await (await fetch(base + "/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
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
